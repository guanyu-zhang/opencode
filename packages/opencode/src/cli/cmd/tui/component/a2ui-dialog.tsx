import { TextAttributes, type InputRenderable } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { createMemo, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useTheme } from "../context/theme"
import { useDialog, type DialogContext } from "../ui/dialog"
import type { A2UIComponent, A2UISurface } from "@/tool/a2ui"

const ICON_MAP: Record<string, string> = {
  accountCircle: "👤", add: "+", arrowBack: "←", arrowForward: "→",
  attachFile: "📎", calendarToday: "📅", call: "📞", camera: "📷",
  check: "✓", close: "✕", delete: "🗑", download: "⬇", edit: "✎",
  event: "📅", error: "✖", fastForward: "⏩", favorite: "♥",
  favoriteOff: "♡", folder: "📁", help: "?", home: "⌂", info: "ℹ",
  locationOn: "📍", lock: "🔒", lockOpen: "🔓", mail: "✉", menu: "☰",
  moreVert: "⋮", moreHoriz: "⋯", notificationsOff: "🔕",
  notifications: "🔔", pause: "⏸", payment: "💳", person: "👤",
  phone: "📞", photo: "🖼", play: "▶", print: "🖨", refresh: "↻",
  rewind: "⏪", search: "🔍", send: "➤", settings: "⚙", share: "⇪",
  shoppingCart: "🛒", skipNext: "⏭", skipPrevious: "⏮", star: "★",
  starHalf: "⯪", starOff: "☆", stop: "⏹", upload: "⬆",
  visibility: "👁", visibilityOff: "◌", volumeDown: "🔉",
  volumeMute: "🔇", volumeOff: "🔈", volumeUp: "🔊", warning: "⚠",
}

type FieldType = "TextField" | "CheckBox" | "ChoicePicker" | "Slider" | "Button" | "DateTimeInput" | "Tabs"

interface FieldState {
  id: string
  type: FieldType
  label: string
  component: A2UIComponent
  textValue: string
  checked: boolean
  selectedIdx: number
  multiSelected: Record<number, boolean>
  sliderVal: number
  buttonIdx: number
  tabIdx: number
}

type RenderItem =
  | { kind: "field"; index: number }
  | { kind: "text"; component: A2UIComponent }
  | { kind: "divider"; axis: string }
  | { kind: "icon"; name: string }

function build(surface: A2UISurface): { fields: FieldState[]; items: RenderItem[] } {
  const fields: FieldState[] = []
  const items: RenderItem[] = []
  const byId = new Map(surface.components.map((c) => [c.id, c]))
  let btnIdx = 0

  function walk(id: string) {
    const comp = byId.get(id)
    if (!comp) return
    const t = comp.type

    if (t === "Text") {
      items.push({ kind: "text", component: comp })
      return
    }
    if (t === "Divider") {
      items.push({ kind: "divider", axis: comp.axis ?? "horizontal" })
      return
    }
    if (t === "Icon") {
      items.push({ kind: "icon", name: typeof comp.name === "string" ? comp.name : comp.id })
      return
    }
    if (t === "Column" || t === "Row" || t === "List") {
      for (const child of comp.children ?? []) walk(child)
      return
    }
    if (t === "Card") {
      if (comp.child) walk(comp.child)
      return
    }
    if (t === "Modal") {
      if (comp.content) walk(comp.content)
      return
    }
    if (t === "Tabs") {
      const label = comp.label ?? comp.text ?? "Tabs"
      const idx = fields.length
      fields.push({
        id: comp.id, type: "Tabs", label, component: comp,
        textValue: "", checked: false, selectedIdx: 0,
        multiSelected: {}, sliderVal: 0, buttonIdx: 0, tabIdx: 0,
      })
      items.push({ kind: "field", index: idx })
      return
    }
    if (t === "DateTimeInput") {
      const label = comp.label ?? comp.text ?? comp.id
      const idx = fields.length
      fields.push({
        id: comp.id, type: "DateTimeInput", label, component: comp,
        textValue: typeof comp.value === "string" ? comp.value : "",
        checked: false, selectedIdx: 0, multiSelected: {},
        sliderVal: 0, buttonIdx: 0, tabIdx: 0,
      })
      items.push({ kind: "field", index: idx })
      return
    }
    if (t === "TextField" || t === "CheckBox" || t === "ChoicePicker" || t === "Slider" || t === "Button") {
      const label = comp.label ?? comp.text ?? comp.id
      const idx = fields.length
      const f: FieldState = {
        id: comp.id, type: t as FieldType, label, component: comp,
        textValue: typeof comp.value === "string" ? comp.value : "",
        checked: typeof comp.value === "boolean" ? comp.value : false,
        selectedIdx: 0, multiSelected: {},
        sliderVal: typeof comp.value === "number" ? comp.value : comp.min ?? 0,
        buttonIdx: t === "Button" ? ++btnIdx : 0, tabIdx: 0,
      }
      if (t === "ChoicePicker" && Array.isArray(comp.value)) {
        const selected = new Set(comp.value as string[])
        for (let i = 0; i < (comp.options?.length ?? 0); i++) {
          if (selected.has(comp.options![i].value)) {
            f.multiSelected[i] = true
            if (comp.variant !== "multipleSelection") f.selectedIdx = i
          }
        }
      }
      fields.push(f)
      items.push({ kind: "field", index: idx })
      return
    }
    for (const child of comp.children ?? []) walk(child)
    if (comp.child) walk(comp.child)
  }

  walk(surface.root)
  return { fields, items }
}

function collect(fields: FieldState[]): Record<string, any> {
  const data: Record<string, any> = {}
  for (const f of fields) {
    if (f.type === "TextField" || f.type === "DateTimeInput") data[f.id] = f.textValue
    if (f.type === "CheckBox") data[f.id] = f.checked
    if (f.type === "Slider") data[f.id] = f.sliderVal
    if (f.type === "Tabs") data[f.id] = f.component.tabs?.[f.tabIdx]?.title ?? ""
    if (f.type === "ChoicePicker") {
      const opts = f.component.options ?? []
      const multi = f.component.variant === "multipleSelection"
      if (multi) {
        data[f.id] = opts.filter((_, i) => f.multiSelected[i]).map((o) => o.value)
      } else {
        data[f.id] = opts[f.selectedIdx]?.value ?? ""
      }
    }
  }
  return data
}

function format(label: string, data: Record<string, any>): string {
  const parts = [`Selected: ${label}`]
  for (const [k, v] of Object.entries(data)) {
    if (Array.isArray(v)) {
      if (v.length) parts.push(`${k}: ${v.join(", ")}`)
    } else if (typeof v === "boolean") {
      parts.push(`${k}: ${v}`)
    } else if (typeof v === "number") {
      parts.push(`${k}: ${v}`)
    } else if (v) {
      parts.push(`${k}: ${v}`)
    }
  }
  return parts.join("\n")
}

export function A2UIDialog(props: {
  surface: A2UISurface
  onSubmit: (result: string) => void
}) {
  const { theme } = useTheme()
  const dialog = useDialog()
  const dimensions = useTerminalDimensions()
  const height = createMemo(() => Math.floor(dimensions().height / 2) - 4)
  const initial = build(props.surface)
  const [store, setStore] = createStore({
    focus: 0,
    fields: initial.fields,
  })
  const items = initial.items

  let inputRef: InputRenderable | undefined

  function refocus() {
    const f = store.fields[store.focus]
    if (f?.type === "TextField" || f?.type === "DateTimeInput") {
      setTimeout(() => inputRef?.focus(), 1)
    }
  }

  function move(delta: number) {
    const n = store.fields.length
    if (!n) return
    setStore("focus", (store.focus + delta + n) % n)
    refocus()
  }

  function submit(cur: FieldState) {
    const data = collect(store.fields)
    const result = format(cur.label, data)
    dialog.clear()
    props.onSubmit(result)
  }

  useKeyboard((evt) => {
    if (!store.fields.length) return
    const cur = store.fields[store.focus]

    if (cur.type === "TextField" || cur.type === "DateTimeInput") {
      if (evt.name === "escape") { dialog.clear(); evt.preventDefault(); return }
      if (evt.name === "tab" || evt.name === "down") { move(1); evt.preventDefault(); return }
      if (evt.name === "up") { move(-1); evt.preventDefault(); return }
      return
    }

    if (evt.name === "escape") { dialog.clear(); evt.preventDefault(); return }
    if (evt.name === "up") { move(-1); evt.preventDefault(); return }
    if (evt.name === "down" || evt.name === "tab") { move(1); evt.preventDefault(); return }

    if (evt.name === "return" || evt.name === "space") {
      if (cur.type === "Button") { submit(cur); evt.preventDefault(); return }
      if (cur.type === "CheckBox") {
        setStore("fields", store.focus, "checked", !cur.checked)
        evt.preventDefault(); return
      }
      if (cur.type === "ChoicePicker" && cur.component.variant === "multipleSelection") {
        setStore("fields", store.focus, "multiSelected", cur.selectedIdx, !cur.multiSelected[cur.selectedIdx])
        evt.preventDefault(); return
      }
    }
    if (evt.name === "left") {
      if (cur.type === "ChoicePicker" && cur.selectedIdx > 0) {
        setStore("fields", store.focus, "selectedIdx", cur.selectedIdx - 1)
        evt.preventDefault()
      }
      if (cur.type === "Slider") {
        const step = ((cur.component.max ?? 100) - (cur.component.min ?? 0)) / 20 || 1
        setStore("fields", store.focus, "sliderVal", Math.max(cur.component.min ?? 0, cur.sliderVal - step))
        evt.preventDefault()
      }
      if (cur.type === "Tabs") {
        if (cur.tabIdx > 0) setStore("fields", store.focus, "tabIdx", cur.tabIdx - 1)
        evt.preventDefault()
      }
      return
    }
    if (evt.name === "right") {
      if (cur.type === "ChoicePicker" && cur.selectedIdx < (cur.component.options?.length ?? 1) - 1) {
        setStore("fields", store.focus, "selectedIdx", cur.selectedIdx + 1)
        evt.preventDefault()
      }
      if (cur.type === "Slider") {
        const step = ((cur.component.max ?? 100) - (cur.component.min ?? 0)) / 20 || 1
        setStore("fields", store.focus, "sliderVal", Math.min(cur.component.max ?? 100, cur.sliderVal + step))
        evt.preventDefault()
      }
      if (cur.type === "Tabs") {
        if (cur.tabIdx < (cur.component.tabs?.length ?? 1) - 1) setStore("fields", store.focus, "tabIdx", cur.tabIdx + 1)
        evt.preventDefault()
      }
      return
    }
    for (const f of store.fields) {
      if (f.type === "Button" && evt.name === String(f.buttonIdx)) {
        submit(f); evt.preventDefault(); return
      }
    }
  })

  const title = createMemo(() => {
    const t = props.surface.components.find(
      (c) => c.type === "Text" && (c.textStyle === "title" || c.variant === "title"),
    )
    return t?.text ?? t?.label ?? ""
  })

  return (
    <box paddingLeft={2} paddingRight={2} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.accent}>
          {title() || "A2UI"}
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>

      <scrollbox maxHeight={height()} scrollbarOptions={{ visible: false }}>
        <box gap={1}>
          <For each={items}>
            {(item) => (
              <>
                <Show when={item.kind === "text"}>
                  <TextItem component={(item as any).component} />
                </Show>
                <Show when={item.kind === "divider"}>
                  <DividerItem />
                </Show>
                <Show when={item.kind === "icon"}>
                  <IconItem name={(item as any).name} />
                </Show>
                <Show when={item.kind === "field"}>
                  <FieldView
                    field={store.fields[(item as any).index]}
                    focused={(item as any).index === store.focus}
                    onTextChange={(v) => setStore("fields", (item as any).index, "textValue", v)}
                    inputRef={(r) => {
                      if ((item as any).index === store.focus) inputRef = r
                    }}
                  />
                </Show>
              </>
            )}
          </For>
        </box>
      </scrollbox>

      <box paddingTop={1} paddingBottom={1}>
        <text fg={theme.textMuted}>
          ↑↓ navigate · tab next · ←→ adjust · enter select · esc dismiss
        </text>
      </box>
    </box>
  )
}

function TextItem(props: { component: A2UIComponent }) {
  const { theme } = useTheme()
  const variant = () => props.component.textStyle ?? props.component.variant ?? "body"
  const isBold = () => variant() === "title" || variant() === "h1" || variant() === "h2"
  return (
    <Show when={!isBold()}>
      <text fg={variant() === "caption" ? theme.textMuted : theme.text}>
        {props.component.text ?? props.component.label ?? ""}
      </text>
    </Show>
  )
}

function DividerItem() {
  const { theme } = useTheme()
  return <text fg={theme.backgroundElement}>{"─".repeat(50)}</text>
}

function IconItem(props: { name: string }) {
  const { theme } = useTheme()
  const icon = () => ICON_MAP[props.name] ?? `[${props.name}]`
  return <text fg={theme.accent}>{icon()}</text>
}

function FieldView(props: {
  field: FieldState
  focused: boolean
  onTextChange: (v: string) => void
  inputRef: (r: InputRenderable) => void
}) {
  const { theme } = useTheme()
  const marker = () => (props.focused ? "▸ " : "  ")

  return (
    <box>
      <Show when={props.field.type === "TextField" || props.field.type === "DateTimeInput"}>
        <box gap={0}>
          <text fg={theme.text} attributes={TextAttributes.BOLD}>
            {marker()}{props.field.label}
            <Show when={props.field.type === "DateTimeInput"}>
              <span style={{ fg: theme.textMuted }}> (ISO 8601)</span>
            </Show>
          </text>
          <box paddingLeft={2}>
            <input
              ref={props.inputRef}
              onInput={(e) => props.onTextChange(e)}
              cursorColor={theme.primary}
              focusedTextColor={theme.text}
              focusedBackgroundColor={props.focused ? theme.backgroundElement : undefined}
              placeholder={props.field.component.placeholder ?? (props.field.type === "DateTimeInput" ? "YYYY-MM-DD" : props.field.label)}
              placeholderColor={theme.textMuted}
            />
          </box>
        </box>
      </Show>

      <Show when={props.field.type === "CheckBox"}>
        <text>
          <span style={{ fg: theme.accent }}>{marker()}</span>
          <span style={{ fg: theme.primary }}>
            <b>{props.field.checked ? "[x]" : "[ ]"}</b>
          </span>
          <span style={{ fg: props.focused ? theme.text : theme.textMuted }}>
            {" "}{props.field.label}
          </span>
        </text>
      </Show>

      <Show when={props.field.type === "ChoicePicker"}>
        <box>
          <text fg={theme.text} attributes={TextAttributes.BOLD}>
            {marker()}{props.field.label}
          </text>
          <For each={props.field.component.options ?? []}>
            {(opt, i) => {
              const multi = props.field.component.variant === "multipleSelection"
              const selected = () => multi ? props.field.multiSelected[i()] : i() === props.field.selectedIdx
              const mark = () => {
                if (multi) return selected() ? "[x]" : "[ ]"
                return selected() ? "(*)" : "( )"
              }
              const highlight = () => props.focused && i() === props.field.selectedIdx
              return (
                <text>
                  <span style={{ fg: theme.primary }}>
                    <b>{"    "}{mark()}</b>
                  </span>
                  <span style={{ fg: highlight() ? theme.primary : theme.text }}>
                    {highlight() ? <b>{" "}{opt.label}</b> : <>{" "}{opt.label}</>}
                  </span>
                </text>
              )
            }}
          </For>
        </box>
      </Show>

      <Show when={props.field.type === "Slider"}>
        <box>
          <text fg={theme.text} attributes={TextAttributes.BOLD}>
            {marker()}{props.field.label}
          </text>
          <box paddingLeft={2} flexDirection="row">
            <SliderBar
              value={props.field.sliderVal}
              min={props.field.component.min ?? 0}
              max={props.field.component.max ?? 100}
              width={30}
            />
            <text fg={theme.text}> {Math.round(props.field.sliderVal)}</text>
          </box>
        </box>
      </Show>

      <Show when={props.field.type === "Tabs"}>
        <box>
          <text fg={theme.text} attributes={TextAttributes.BOLD}>
            {marker()}{props.field.label}
          </text>
          <box paddingLeft={2} flexDirection="row" gap={1}>
            <For each={props.field.component.tabs ?? []}>
              {(tab, i) => {
                const active = () => i() === props.field.tabIdx
                return (
                  <box
                    paddingLeft={1}
                    paddingRight={1}
                    backgroundColor={active() ? theme.primary : theme.backgroundElement}
                  >
                    <text fg={active() ? theme.selectedListItemText : theme.textMuted}>
                      {tab.title}
                    </text>
                  </box>
                )
              }}
            </For>
          </box>
        </box>
      </Show>

      <Show when={props.field.type === "Button"}>
        <box flexDirection="row" paddingTop={0}>
          <box
            paddingLeft={1}
            paddingRight={1}
            backgroundColor={props.focused ? theme.primary : theme.backgroundElement}
          >
            <text fg={props.focused ? theme.selectedListItemText : theme.textMuted} attributes={TextAttributes.BOLD}>
              {props.field.buttonIdx}
            </text>
          </box>
          <box paddingLeft={1}>
            <text
              fg={props.focused ? theme.primary : theme.text}
              attributes={props.focused ? TextAttributes.BOLD : undefined}
            >
              {props.field.label}
            </text>
          </box>
        </box>
      </Show>
    </box>
  )
}

function SliderBar(props: { value: number; min: number; max: number; width: number }) {
  const { theme } = useTheme()
  const ratio = createMemo(() => {
    const range = props.max - props.min
    if (range <= 0) return 0
    return Math.max(0, Math.min(1, (props.value - props.min) / range))
  })
  const filled = createMemo(() => Math.round(ratio() * props.width))
  const empty = createMemo(() => props.width - filled())

  return (
    <text>
      <span style={{ fg: theme.primary }}>{"█".repeat(filled())}</span>
      <span style={{ fg: theme.backgroundElement }}>{"░".repeat(empty())}</span>
    </text>
  )
}

A2UIDialog.show = (
  dialog: DialogContext,
  surface: A2UISurface,
  onSubmit: (result: string) => void,
) => {
  dialog.replace(() => <A2UIDialog surface={surface} onSubmit={onSubmit} />)
}
