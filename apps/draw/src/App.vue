<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ArrowUp, ArrowUpRight, Check, ChevronDown, Download, Eye, EyeOff, Image as ImageIcon, KeyRound, LoaderCircle, Plus, Square, Trash2, WandSparkles, X, Copy, Pencil } from '@lucide/vue'
import Modal from './components/Modal.vue'
import AspectPicker from './components/AspectPicker.vue'
import { templates } from './data/templates'
import { allowedAspects, friendlyError, generateImage, loadModels } from './lib/api'
import { listArtworks, removeArtwork, saveArtwork } from './lib/history'
import { allowedQualities, supportsComplexity, qualityLabels, complexityLabels } from './lib/image-options'
import { downloadBlob, validateReference } from './lib/files'
import type { Artwork, Aspect, DisplayArtwork, ImageQuality, ImageComplexity, Template } from './types'

const tab = ref<'templates' | 'history'>('templates')
const modal = ref<'template' | 'settings' | 'artwork' | 'clear' | null>(null)
const selectedTemplate = ref<Template>(templates[0])
const selectedArtwork = ref<DisplayArtwork>()
const templatePrompt = ref(''), templateAspect = ref<Aspect>('auto')
const prompt = ref(''), aspect = ref<Aspect>('auto')
const quality = ref<ImageQuality>('auto'), complexity = ref<ImageComplexity>('auto')
const key = ref(''), keyDraft = ref(''), showKey = ref(false)
const model = ref('gpt-image-2'), models = ref<string[]>([])
const connecting = ref(false), connectionError = ref(''), connectionSuccess = ref(false)
const reference = ref<File>(), referenceUrl = ref('')
const upload = ref<HTMLInputElement>(), composer = ref<HTMLTextAreaElement>()
const artworks = ref<DisplayArtwork[]>([])
const busy = ref(false), elapsed = ref(0), previewUrl = ref('')
const error = ref(''), notice = ref(''), historyWarning = ref('')
const settingsOpen = ref(false), dragOver = ref(false), deleting = ref(false)
let generationController: AbortController | undefined, connectController: AbortController | undefined
let timer: ReturnType<typeof setInterval> | undefined, deadline: ReturnType<typeof setTimeout> | undefined
let noticeTimer: ReturnType<typeof setTimeout> | undefined
const aspectOptions = computed(() => allowedAspects(model.value))
const qualityOptions = computed(() => allowedQualities(model.value))
const hasComplexity = computed(() => supportsComplexity(model.value))
const elapsedLabel = computed(() => elapsed.value < 60 ? `${elapsed.value} 秒` : `${Math.floor(elapsed.value / 60)} 分 ${elapsed.value % 60} 秒`)
const connected = computed(() => !!key.value && models.value.length > 0)
const cover = (id: string) => `${import.meta.env.BASE_URL}templates/${id}.webp`
const formatDate = (value: number) => new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(value)

function toast(message: string) { notice.value = message; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => notice.value = '', 6000) }
function openSettings() { keyDraft.value = key.value; connectionError.value = ''; connectionSuccess.value = false; showKey.value = false; modal.value = 'settings' }
function closeModal() { if (modal.value === 'settings') { connectController?.abort(); connecting.value = false; keyDraft.value = ''; showKey.value = false }; modal.value = null }
function openTemplate(item: Template) { selectedTemplate.value = item; templatePrompt.value = item.prompt; templateAspect.value = item.aspect; modal.value = 'template' }
async function useTemplate() { prompt.value = templatePrompt.value; aspect.value = aspectOptions.value.includes(templateAspect.value) ? templateAspect.value : 'auto'; closeModal(); await focusPrompt() }
async function focusPrompt() { await nextTick(); composer.value?.focus(); resizeComposer() }
function resizeComposer() { if (composer.value) { composer.value.style.height = 'auto'; composer.value.style.height = `${Math.min(composer.value.scrollHeight, 140)}px` } }

async function connect(value = keyDraft.value, silent = false) {
  const candidate = value.trim()
  if (!candidate) { connectionError.value = '请先粘贴你的 API Key。'; return }
  connectController?.abort()
  const controller = new AbortController(); connectController = controller
  connecting.value = true; connectionError.value = ''; connectionSuccess.value = false
  const timeout = setTimeout(() => controller.abort(), 20_000)
  try {
    const available = await loadModels(candidate, controller.signal)
    if (controller.signal.aborted) return
    key.value = candidate; models.value = available
    if (!available.includes(model.value)) model.value = available.includes('gpt-image-2') ? 'gpt-image-2' : available[0]
    try { sessionStorage.setItem('image-draw-key', candidate) } catch { if (!silent) toast('连接成功；浏览器不允许保存会话，刷新后需重新连接。') }
    connectionSuccess.value = true
  } catch (err) {
    if (controller !== connectController) return
    connectionError.value = controller.signal.aborted ? '连接超时，请稍后重试。' : friendlyError(err, candidate)
    if (silent) { key.value = ''; models.value = []; try { sessionStorage.removeItem('image-draw-key') } catch {}; toast('请重新连接 API Key。') }
  } finally { clearTimeout(timeout); if (controller === connectController) connecting.value = false }
}

function disconnect() {
  connectController?.abort(); key.value = ''; keyDraft.value = ''; models.value = []; connectionSuccess.value = false
  try { sessionStorage.removeItem('image-draw-key') } catch {}
  toast('已清除 API Key。'); closeModal()
}

async function setReference(file?: File) {
  if (!file || busy.value) return
  try {
    await validateReference(file)
    if (referenceUrl.value) URL.revokeObjectURL(referenceUrl.value)
    reference.value = file; referenceUrl.value = URL.createObjectURL(file); error.value = ''
  } catch (err) { toast(friendlyError(err)) }
}
function clearReference() { if (referenceUrl.value) URL.revokeObjectURL(referenceUrl.value); reference.value = undefined; referenceUrl.value = '' }
async function onUpload(event: Event) { const element = event.target as HTMLInputElement; await setReference(element.files?.[0]); element.value = '' }
async function onDrop(event: DragEvent) { dragOver.value = false; if (event.dataTransfer?.files.length) await setReference(event.dataTransfer.files[0]) }
function onPaste(event: ClipboardEvent) { const file = [...(event.clipboardData?.items ?? [])].find(item => item.type.startsWith('image/'))?.getAsFile(); if (file) { event.preventDefault(); void setReference(file) } }

function replaceHistory(items: Artwork[]) {
  artworks.value.forEach(item => URL.revokeObjectURL(item.url))
  artworks.value = items.map(item => ({ ...item, url: URL.createObjectURL(item.blob), persisted: item.persisted !== false }))
}
async function refreshHistory() { replaceHistory(await listArtworks()) }

async function generate() {
  if (busy.value || !prompt.value.trim()) return
  if (!connected.value) { openSettings(); return }
  settingsOpen.value = false; error.value = ''; previewUrl.value = ''; tab.value = 'history'; busy.value = true; elapsed.value = 0
  const controller = new AbortController(); generationController = controller
  const snapshot = { key: key.value, prompt: prompt.value, model: model.value, aspect: aspect.value, quality: quality.value, complexity: hasComplexity.value ? complexity.value : 'auto' as ImageComplexity, reference: reference.value }
  let timedOut = false
  timer = setInterval(() => elapsed.value++, 1000)
  deadline = setTimeout(() => { timedOut = true; controller.abort() }, 30 * 60 * 1000)
  try {
    const blob = await generateImage({ ...snapshot, signal: controller.signal, onPreview: (image) => { if (previewUrl.value) URL.revokeObjectURL(previewUrl.value); previewUrl.value = URL.createObjectURL(image) } })
    if (controller.signal.aborted) return
    const artwork: Artwork = { id: crypto.randomUUID(), blob, prompt: snapshot.prompt, model: snapshot.model, aspect: snapshot.aspect, quality: snapshot.quality, complexity: snapshot.complexity, createdAt: Date.now() }
    try { await saveArtwork(artwork); await refreshHistory() }
    catch { historyWarning.value = '这次作品未能保存到本机历史，请先下载。'; artworks.value.unshift({ ...artwork, persisted: false, url: URL.createObjectURL(blob) }) }
    selectedArtwork.value = artworks.value.find(item => item.id === artwork.id)
    modal.value = 'artwork'; toast('图像已完成。')
  } catch (err) {
    error.value = controller.signal.aborted ? (timedOut ? '等待已超时，上游可能仍在生成。请先查看平台用量记录，再决定是否重试。' : '已停止等待。上游可能继续生成并计费，请先查看平台用量记录。') : friendlyError(err, snapshot.key)
  } finally {
    clearInterval(timer); clearTimeout(deadline); busy.value = false; generationController = undefined
    if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = ''
  }
}

function download(artwork: DisplayArtwork) { downloadBlob(artwork.blob, `image-${new Date(artwork.createdAt).toISOString().replace(/[:.]/g, '-')}.${artwork.blob.type === 'image/webp' ? 'webp' : artwork.blob.type === 'image/jpeg' ? 'jpg' : 'png'}`) }
async function reuse(artwork: DisplayArtwork, asReference = false) {
  if (models.value.includes(artwork.model)) model.value = artwork.model
  prompt.value = artwork.prompt; aspect.value = aspectOptions.value.includes(artwork.aspect) ? artwork.aspect : 'auto'
  quality.value = qualityOptions.value.includes(artwork.quality ?? 'auto') ? artwork.quality ?? 'auto' : 'auto'
  complexity.value = hasComplexity.value ? artwork.complexity ?? 'auto' : 'auto'
  if (asReference) await setReference(new File([artwork.blob], 'reference.png', { type: artwork.blob.type }))
  closeModal(); await focusPrompt()
}
async function deleteOne(artwork: DisplayArtwork) {
  if (deleting.value) return
  deleting.value = true
  try { if (artwork.persisted !== false) await removeArtwork(artwork.id); artworks.value = artworks.value.filter(item => item.id !== artwork.id); URL.revokeObjectURL(artwork.url); closeModal(); toast('已从本机删除。') }
  catch { toast('删除失败，请稍后再试。') } finally { deleting.value = false }
}
async function clearHistory() {
  deleting.value = true
  try { await removeArtwork(); replaceHistory([]); closeModal(); toast('本机历史已清空。') } catch { toast('清空失败，请稍后再试。') } finally { deleting.value = false }
}
async function copyPrompt(text: string) { try { await navigator.clipboard.writeText(text); toast('描述已复制。') } catch { toast('复制失败，可以直接选中描述复制。') } }
function beforeUnload(event: BeforeUnloadEvent) { if (busy.value) { event.preventDefault(); event.returnValue = '' } }

watch(model, () => {
  if (!aspectOptions.value.includes(aspect.value)) aspect.value = 'auto'
  if (!qualityOptions.value.includes(quality.value)) quality.value = 'auto'
  if (!hasComplexity.value) complexity.value = 'auto'
})
watch(prompt, () => nextTick(resizeComposer))
onMounted(async () => {
  window.addEventListener('beforeunload', beforeUnload)
  try { const saved = sessionStorage.getItem('image-draw-key'); if (saved) void connect(saved, true) } catch {}
  try { await refreshHistory() } catch { historyWarning.value = '浏览器暂不支持本机历史，生成后请直接下载。' }
})
onBeforeUnmount(() => { generationController?.abort(); connectController?.abort(); clearInterval(timer); clearTimeout(deadline); clearTimeout(noticeTimer); clearReference(); artworks.value.forEach(item => URL.revokeObjectURL(item.url)); window.removeEventListener('beforeunload', beforeUnload) })
</script>

<template>
  <a class="skip-link" href="#main">跳转到内容</a>
  <div class="page" @dragover.prevent="dragOver = !busy" @dragleave.self="dragOver = false" @drop.prevent="onDrop">
    <header class="page-header">
      <a href="/draw/" class="brand" aria-label="图像首页"><ImageIcon :size="25" :stroke-width="1.6" aria-hidden="true" /><h1 style="font: inherit; margin: 0">图像</h1></a>
      <div class="header-actions">
        <a href="/" class="platform-link">返回平台<ArrowUpRight :size="15" aria-hidden="true" /></a>
        <button class="connection-button" :disabled="busy" @click="openSettings"><span v-if="connected" class="connection-dot"></span><KeyRound v-else :size="16" aria-hidden="true" />{{ connected ? '已连接' : '连接 API' }}</button>
      </div>
    </header>

    <main id="main">
      <div class="gallery-heading">
        <div class="tabs" role="tablist" aria-label="图像内容">
          <button id="templates-tab" role="tab" :aria-selected="tab === 'templates'" aria-controls="templates-panel" :class="{ active: tab === 'templates' }" @click="tab = 'templates'" @keydown.right="tab = 'history'; ($refs.historyTab as HTMLButtonElement)?.focus()">灵感模板</button>
          <button id="history-tab" ref="historyTab" role="tab" :aria-selected="tab === 'history'" aria-controls="history-panel" :class="{ active: tab === 'history' }" @click="tab = 'history'" @keydown.left="tab = 'templates'; ($event.currentTarget as HTMLElement).previousElementSibling && (($event.currentTarget as HTMLElement).previousElementSibling as HTMLElement).focus()">我的作品<span v-if="artworks.length" class="count">{{ artworks.length }}</span></button>
        </div>
        <span v-if="tab === 'templates'" class="gallery-hint">从一个灵感开始</span>
        <button v-else-if="artworks.length" class="text-button clear-button" :disabled="busy" @click="modal = 'clear'"><Trash2 :size="15" aria-hidden="true" />清空记录</button>
      </div>

      <section v-if="tab === 'templates'" id="templates-panel" class="gallery" role="tabpanel" aria-labelledby="templates-tab">
        <button v-for="(item, index) in templates" :key="item.id" class="template-card" :style="{ backgroundColor: item.color }" :aria-label="`查看${item.title}模板`" @click="openTemplate(item)">
          <img :src="cover(item.id)" :alt="item.title + '示例'" :loading="index < 5 ? 'eager' : 'lazy'" width="640" height="724" />
          <div class="card-caption"><span>{{ item.title }}</span><span class="card-arrow"><ArrowUpRight :size="18" aria-hidden="true" /></span></div>
        </button>
      </section>

      <section v-else id="history-panel" role="tabpanel" aria-labelledby="history-tab">
        <p class="history-note">作品仅保存在当前浏览器，重要的图像记得下载。</p>
        <p v-if="historyWarning" class="inline-warning" role="status">{{ historyWarning }}</p>
        <div v-if="busy || artworks.length" class="gallery history-gallery">
          <div v-if="busy" class="generating-card" aria-live="polite" aria-label="正在生成图像">
            <img v-if="previewUrl" :src="previewUrl" alt="正在生成的预览" class="partial-preview" />
            <div class="generation-progress"><div class="generation-orb"><WandSparkles :size="27" :stroke-width="1.4" aria-hidden="true" /></div><span>正在描绘你的想象</span><small aria-hidden="true">{{ elapsedLabel }}</small><button class="text-button" @click="generationController?.abort()">停止等待</button></div>
          </div>
          <div v-for="artwork in artworks" :key="artwork.id" class="artwork-card">
            <button class="artwork-image" :aria-label="`查看作品：${artwork.prompt.slice(0, 30)}`" @click="selectedArtwork = artwork; modal = 'artwork'"><img :src="artwork.url" :alt="artwork.prompt" loading="lazy" /></button>
            <div class="artwork-caption"><p>{{ artwork.prompt }}</p><button class="icon-button" aria-label="下载原图" @click="download(artwork)"><Download :size="18" aria-hidden="true" /></button></div>
          </div>
        </div>
        <div v-else class="empty-state"><div class="empty-icon"><ImageIcon :size="32" :stroke-width="1.3" aria-hidden="true" /></div><h2>你的想象，即将在这里出现</h2><p>写下一个想法，或者从灵感模板开始。</p><button class="secondary-button" @click="tab = 'templates'">探索灵感<ArrowUpRight :size="16" aria-hidden="true" /></button></div>
      </section>
    </main>

    <div class="composer-dock">
      <p v-if="error" class="generation-error" role="alert">{{ error }}<a href="/key-usage" target="_blank" rel="noopener noreferrer">查看用量<ArrowUpRight :size="13" aria-hidden="true" /></a><button class="icon-button" aria-label="关闭错误提示" @click="error = ''"><X :size="17" aria-hidden="true" /></button></p>
      <div v-if="settingsOpen" id="generation-settings" class="composer-settings" role="group" aria-label="生成设置选项" @keydown.esc.stop="settingsOpen = false; ($refs.settingsTrigger as HTMLButtonElement)?.focus()">
        <h2>生成设置</h2>
        <div><span>画面比例</span><AspectPicker v-model="aspect" :options="aspectOptions" :disabled="busy" label="输入栏画面比例" /></div>
        <label>图片模型<select v-model="model" :disabled="!connected || busy" aria-label="图片模型"><option v-if="!models.length" :value="model">连接后选择</option><option v-for="item in models" :key="item" :value="item">{{ item }}</option></select></label>
        <label>图片质量<select v-model="quality" :disabled="busy" aria-label="图片质量" aria-describedby="quality-hint"><option v-for="item in qualityOptions" :key="item" :value="item">{{ qualityLabels[item] }}</option></select></label>
        <p id="quality-hint">质量越高，可能耗时更长、消耗更多额度。用量按平台规则计算。</p>
        <template v-if="hasComplexity">
          <label class="complexity-field">创作复杂度<select v-model="complexity" :disabled="busy" aria-label="创作复杂度" aria-describedby="complexity-hint"><option v-for="(label, value) in complexityLabels" :key="value" :value="value">{{ label }}</option></select></label>
          <p id="complexity-hint">Image 2.6 的独立创作参数，通常保留模型默认即可。</p>
        </template>
      </div>
      <form class="composer" :class="{ 'has-reference': reference, 'is-busy': busy }" @submit.prevent="generate">
        <div v-if="reference" class="reference-strip"><div class="reference-thumbnail"><img :src="referenceUrl" alt="已上传的参考图" /><button :disabled="busy" aria-label="移除参考图" @click="clearReference" type="button"><X :size="13" aria-hidden="true" /></button></div><div><span>参考图</span><small>{{ reference.name }}</small></div></div>
        <div class="composer-row">
          <button type="button" class="icon-button upload-button" :disabled="busy" aria-label="上传参考图" title="上传参考图 · 支持拖拽和粘贴" @click="upload?.click()"><Plus :size="25" :stroke-width="1.7" aria-hidden="true" /></button>
          <label class="sr-only" for="prompt">描述你想创作的图像</label>
          <textarea id="prompt" ref="composer" v-model="prompt" rows="1" maxlength="12000" :placeholder="reference ? '描述你想怎样修改这张图片…' : '描述你想创作的图像…'" @input="resizeComposer" @paste="onPaste" @keydown.enter.exact="if (!$event.isComposing && !$event.shiftKey) { $event.preventDefault(); generate() }"></textarea>
          <button ref="settingsTrigger" type="button" class="model-chip" :disabled="busy" :aria-expanded="settingsOpen" aria-controls="generation-settings" aria-label="生成设置" :title="`${model} · ${qualityLabels[quality]}质量`" @keydown.esc="settingsOpen = false" @click="settingsOpen = !settingsOpen"><span>设置 · {{ qualityLabels[quality] }}</span><ChevronDown :size="14" aria-hidden="true" /></button>
          <button v-if="busy" type="button" class="submit-button" aria-label="停止等待" @click="generationController?.abort()"><Square :size="15" fill="currentColor" aria-hidden="true" /></button>
          <button v-else type="submit" class="submit-button" :disabled="!prompt.trim()" aria-label="生成图像"><ArrowUp :size="24" aria-hidden="true" /></button>
        </div>
      </form>
      <p class="composer-footnote">{{ busy ? '生成可能需要几分钟，请保持页面打开。' : reference ? '参考图仅用于本次生成 · Shift + Enter 换行' : '把想象写下来，其余交给图像。' }}</p>
    </div>
    <input ref="upload" class="sr-only" type="file" accept="image/png,image/jpeg,image/webp" aria-label="选择参考图文件" :disabled="busy" @change="onUpload" />
    <div v-if="dragOver" class="drop-zone"><ImageIcon :size="42" aria-hidden="true" /><span>放开，添加参考图</span><small>PNG、JPEG 或 WebP · 最大 10 MB</small></div>
    <div v-if="notice" class="toast" role="status"><Check :size="17" aria-hidden="true" />{{ notice }}</div>

    <Modal v-if="modal === 'template'" :label="selectedTemplate.title" wide @close="closeModal">
      <div class="detail-layout"><div class="detail-image" :style="{ backgroundColor: selectedTemplate.color }"><img :src="cover(selectedTemplate.id)" :alt="selectedTemplate.title + '示例'" /></div><div class="detail-controls"><div><span class="eyebrow">灵感模板</span><h2>{{ selectedTemplate.title }}</h2><p class="detail-description">{{ selectedTemplate.description }}</p></div><label class="prompt-label" for="template-prompt">创作描述<span>可以改成你的想法</span></label><textarea id="template-prompt" v-model="templatePrompt" class="template-prompt" maxlength="12000" rows="5"></textarea><div class="detail-option"><span>画面比例</span><AspectPicker v-model="templateAspect" :options="aspectOptions" label="模板画面比例" /></div><div class="upload-option"><span>参考图 <small>可选</small></span><button v-if="!reference" class="upload-tile" :disabled="busy" aria-label="为模板上传参考图" @click="upload?.click()"><Plus :size="26" :stroke-width="1.6" aria-hidden="true" /></button><div v-else class="template-reference"><img :src="referenceUrl" alt="参考图" /><button class="icon-button" :disabled="busy" aria-label="移除参考图" @click="clearReference"><X :size="15" aria-hidden="true" /></button></div></div><div class="detail-bottom"><span>示例仅供灵感参考</span><button class="primary-button" :disabled="!templatePrompt.trim() || busy" @click="useTemplate">试试这个<ArrowUpRight :size="18" aria-hidden="true" /></button></div></div></div>
    </Modal>

    <Modal v-if="modal === 'settings'" label="连接你的 API" @close="closeModal">
      <form class="settings-modal" @submit.prevent="connect()"><div class="settings-icon"><KeyRound :size="23" :stroke-width="1.5" aria-hidden="true" /></div><h2>连接你的 API</h2><p class="modal-description">使用平台的 API Key，开始你的创作。</p><label for="api-endpoint">接口地址</label><div id="api-endpoint" class="readonly-field">https://sub.velunest.top/v1<span>本站</span></div><label for="api-key">API Key</label><div class="key-input"><input id="api-key" v-model="keyDraft" :type="showKey ? 'text' : 'password'" placeholder="粘贴你的 API Key" autocomplete="off" autocapitalize="off" spellcheck="false" :disabled="connecting || busy" /><button type="button" class="icon-button" :aria-label="showKey ? '隐藏 Key' : '显示 Key'" @click="showKey = !showKey"><EyeOff v-if="showKey" :size="19" aria-hidden="true" /><Eye v-else :size="19" aria-hidden="true" /></button></div><p class="field-hint">仅保存在当前标签页会话中，关闭后需重新输入。</p><p v-if="connectionError" class="field-error" role="alert">{{ connectionError }}</p><p v-if="connectionSuccess" class="field-success" role="status"><Check :size="16" aria-hidden="true" />连接成功，找到 {{ models.length }} 个图片模型。</p><div v-if="connected" class="model-field"><label for="settings-model">图片模型</label><select id="settings-model" v-model="model"><option v-for="item in models" :key="item" :value="item">{{ item }}</option></select></div><a class="get-key" href="/keys" target="_blank" rel="noopener noreferrer">去平台获取 API Key<ArrowUpRight :size="14" aria-hidden="true" /></a><div class="settings-footer"><button v-if="connected" type="button" class="text-button" :disabled="connecting" @click="disconnect">清除连接</button><span v-else></span><button v-if="connectionSuccess && keyDraft.trim() === key" type="button" class="primary-button" @click="closeModal">开始创作</button><button v-else class="primary-button" :disabled="connecting || busy || !keyDraft.trim()" type="submit"><LoaderCircle v-if="connecting" class="spin" :size="17" aria-hidden="true" />{{ connecting ? '正在连接' : '连接并验证' }}</button></div></form>
    </Modal>

    <Modal v-if="modal === 'artwork' && selectedArtwork" label="查看作品" wide @close="closeModal">
      <div class="detail-layout result-layout"><div class="result-image"><img :src="selectedArtwork.url" :alt="selectedArtwork.prompt" /></div><div class="detail-controls"><div><span class="eyebrow">我的作品</span><h2>想象，已成真。</h2><p class="detail-description">{{ formatDate(selectedArtwork.createdAt) }}</p></div><div class="result-prompt"><p>{{ selectedArtwork.prompt }}</p><button class="text-button" @click="copyPrompt(selectedArtwork.prompt)"><Copy :size="15" aria-hidden="true" />复制描述</button></div><div class="result-meta"><span>{{ selectedArtwork.model }}</span><span>{{ selectedArtwork.aspect === 'auto' ? '自动比例' : selectedArtwork.aspect }}</span><span>{{ qualityLabels[selectedArtwork.quality ?? 'auto'] }}质量</span><span v-if="supportsComplexity(selectedArtwork.model) && selectedArtwork.complexity && selectedArtwork.complexity !== 'auto'">{{ complexityLabels[selectedArtwork.complexity] }}复杂度</span></div><div class="result-actions"><button class="secondary-button" :disabled="busy" @click="reuse(selectedArtwork, true)"><Pencil :size="17" aria-hidden="true" />以此为参考继续创作</button><button class="secondary-button" :disabled="busy" @click="reuse(selectedArtwork)"><WandSparkles :size="17" aria-hidden="true" />复用这段描述</button></div><div class="detail-bottom"><button class="icon-button" aria-label="删除这张作品" :disabled="deleting" @click="deleteOne(selectedArtwork)"><Trash2 :size="19" aria-hidden="true" /></button><button class="primary-button" @click="download(selectedArtwork)"><Download :size="17" aria-hidden="true" />下载原图</button></div></div></div>
    </Modal>

    <Modal v-if="modal === 'clear'" label="清空本机作品" @close="closeModal"><div class="settings-modal"><h2>清空本机作品？</h2><p class="modal-description">将删除这个浏览器里保存的 {{ artworks.length }} 张图像和描述。已经下载的文件不受影响。</p><div class="confirm-footer"><button class="secondary-button" :disabled="deleting" @click="closeModal">保留作品</button><button class="primary-button danger" :disabled="deleting" @click="clearHistory">{{ deleting ? '正在清空' : '确认清空' }}</button></div></div></Modal>
  </div>
</template>
