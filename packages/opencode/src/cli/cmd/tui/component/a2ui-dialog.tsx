import { TextAttributes, type InputRenderable } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { createMemo, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useTheme } from "../context/theme"
import { useDialog, type DialogContext } from "../ui/dialog"
import type { A2UIComponent, A2UISurface } from "@/tool/a2ui"

type FieldType = "TextField" | "CheckBox" | "ChoicePicker" | "Slider" | "Button"

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
}

function extractFields(surface: A2UISurface): FieldState[] {
  const fields: FieldState[] = []
  const byId = new Map(surface.components.map((c) => [c.id, c]))
  let btnIdx = 0

  function walk(id: string) {
    const comp = byId.get(id)
    if (!comp) return
    const t = comp.type
    if (t === "TextField" || t === "CheckBox" || t === "ChoicePicker" || t === "Slider" || t === "Button") {
      const label = comp.label ?? comp.text ?? comp.id
      const f: FieldState = {
        id: comp.id,
        type: t as FieldType,
        label,
        component: comp,
        textValue: typeof comp.value === "string" ? comp.value : "",
        checked: typeof comp.value === "boolean" ? comp.value : false,
        selectedIdx: 0,
        multiSelected: {},
        sliderVal: typeof comp.value === "number" ? comp.value : comp.min ?? 0,
        buttonIdx: t === "Button" ? ++btnIdx : 0,
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
    }
    for (const childId of comp.children ?? []) walk(childId)
    if (comp.child) walk(comp.child)
  }

  walk(surface.root)
  return fields
}

function collectFormData(fields: FieldState[]): Record<string, any> {
  const data: Record<string, any> = {}
  for (const f of fields) {
    if (f.type === "TextField") data[f.id] = f.textValue
    if (f.type === "CheckBox") data[f.id] = f.checked
    if (f.type === "Slider") data[f.id] = f.sliderVal
    if (f.type === "ChoicePicker") {
      const opts = f.component.options ?? []
      const isMulti = f.component.variant === "multipleSelection"
      if (isMulti) {
        data[f.id] = opts.filter((_, i) => f.multiSelected[i]).map((o) => o.value)
      } else {
        data[f.id] = opts[f.selectedIdx]?.value ?? ""
      }
    }
  }
  return data
}

function formatResult(label: string, formData: Record<string, any>): string {
  const parts = [`Selected: ${label}`]
  for (const [k, v] of Object.entries(formData)) {
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
  const maxHeight = createMemo(() => Math.floor(dimensions().height / 2) - 4)
  const [store, setStore] = createStore({
    focusIndex: 0,
    fields: extractFields(props.surface),
  })

  let inputRef: InputRenderable | undefined

  function focusField() {
    const f = store.fields[store.focusIndex]
    if (f?.type === "TextField") {
      setTimeout(() => inputRef?.focus(), 1)
    }
  }

  function move(delta: number) {
    const n = store.fields.length
    if (!n) return
    setStore("focusIndex", (store.focusIndex + delta + n) % n)
    focusField()
  }

  useKeyboard((evt) => {
    if (!store.fields.length) return
    const cur = store.fields[store.focusIndex]

    if (cur.type === "TextField") {
      if (evt.name === "escape") {
        dialog.clear()
        evt.preventDefault()
        return
      }
      if (evt.name === "tab" || evt.name === "down") {
        move(1)
        evt.preventDefault()
        return
      }
      if (evt.name === "up") {
        move(-1)
        evt.preventDefault()
        return
      }
      return
    }

    if (evt.name === "escape") {
      dialog.clear()
      evt.preventDefault()
      return
    }
    if (evt.name === "up") {
      move(-1)
      evt.preventDefault()
      return
    }
    if (evt.name === "down" || evt.name === "tab") {
      move(1)
      evt.preventDefault()
      return
    }
    if (evt.name === "return" || evt.name === "space") {
      if (cur.type === "Button") {
        const data = collectFormData(store.fields)
        const result = formatResult(cur.label, data)
        dialog.clear()
        props.onSubmit(result)
        evt.preventDefault()
        return
      }
      if (cur.type === "CheckBox") {
        setStore("fields", store.focusIndex, "checked", !cur.checked)
        evt.preventDefault()
        return
      }
      if (cur.type === "ChoicePicker" && cur.component.variant === "multipleSelection") {
        setStore("fields", store.focusIndex, "multiSelected", cur.selectedIdx, !cur.multiSelected[cur.selectedIdx])
        evt.preventDefault()
        return
      }
    }
    if (evt.name === "left") {
      if (cur.type === "ChoicePicker" && cur.selectedIdx > 0) {
        setStore("fields", store.focusIndex, "selectedIdx", cur.selectedIdx - 1)
        evt.preventDefault()
      }
      if (cur.type === "Slider") {
        const step = ((cur.component.max ?? 100) - (cur.component.min ?? 0)) / 20 || 1
        setStore("fields", store.focusIndex, "sliderVal", Math.max(cur.component.min ?? 0, cur.sliderVal - step))
        evt.preventDefault()
      }
      return
    }
    if (evt.name === "right") {
      if (cur.type === "ChoicePicker" && cur.selectedIdx < (cur.component.options?.length ?? 1) - 1) {
        setStore("fields", store.focusIndex, "selectedIdx", cur.selectedIdx + 1)
        evt.preventDefault()
      }
      if (cur.type === "Slider") {
        const step = ((cur.component.max ?? 100) - (cur.component.min ?? 0)) / 20 || 1
        setStore("fields", store.focusIndex, "sliderVal", Math.min(cur.component.max ?? 100, cur.sliderVal + step))
        evt.preventDefault()
      }
      return
    }
    for (const f of store.fields) {
      if (f.type === "Button" && evt.name === String(f.buttonIdx)) {
        const data = collectFormData(store.fields)
        const result = formatResult(f.label, data)
        dialog.clear()
        props.onSubmit(result)
        evt.preventDefault()
        return
      }
    }
  })

  const texts = createMemo(() =>
    props.surface.components.filter((c) => c.type === "Text"),
  )
  const title = createMemo(() => {
    const t = texts().find((c) => c.textStyle === "title" || c.variant === "title")
    return t?.text ?? t?.label ?? ""
  })
  const body = createMemo(() =>
    texts().filter((c) => c.textStyle !== "title" && c.variant !== "title"),
  )

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

      <scrollbox maxHeight={maxHeight()} scrollbarOptions={{ visible: false }}>
        <box gap={1}>
          <For each={body()}>
            {(comp) => {
              const variant = comp.textStyle ?? comp.variant ?? "body"
              const color = variant === "caption" ? theme.textMuted : theme.text
              return (
                <text fg={color}>
                  {comp.text ?? comp.label ?? ""}
                </text>
              )
            }}
          </For>

          <For each={store.fields}>
            {(field, index) => {
              const focused = createMemo(() => index() === store.focusIndex)
              return (
                <FieldView
                  field={field}
                  focused={focused()}
                  onTextChange={(v) => setStore("fields", index(), "textValue", v)}
                  inputRef={(r) => {
                    if (focused()) inputRef = r
                  }}
                />
              )
            }}
          </For>
        </box>
      </scrollbox>

      <box paddingTop={1} paddingBottom={1}>
        <text fg={theme.textMuted}>
          ↑↓ navigate · tab next · enter select · esc dismiss
        </text>
      </box>
    </box>
  )
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
      <Show when={props.field.type === "TextField"}>
        <box gap={0}>
          <text fg={theme.text} attributes={TextAttributes.BOLD}>
            {marker()}{props.field.label}
          </text>
          <box paddingLeft={2}>
            <input
              ref={props.inputRef}
              onInput={(e) => props.onTextChange(e)}
              cursorColor={theme.primary}
              focusedTextColor={theme.text}
              focusedBackgroundColor={props.focused ? theme.backgroundElement : undefined}
              placeholder={props.field.component.placeholder ?? props.field.label}
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
              const isMulti = props.field.component.variant === "multipleSelection"
              const selected = () =>
                isMulti ? props.field.multiSelected[i()] : i() === props.field.selectedIdx
              const markerStr = () => {
                if (isMulti) return selected() ? "[x]" : "[ ]"
                return selected() ? "(*)" : "( )"
              }
              const highlight = () => props.focused && i() === props.field.selectedIdx
              return (
                <text>
                  <span style={{ fg: theme.primary }}>
                    <b>{"    "}{markerStr()}</b>
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
              focused={props.focused}
            />
            <text fg={theme.text}> {Math.round(props.field.sliderVal)}</text>
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

function SliderBar(props: { value: number; min: number; max: number; width: number; focused: boolean }) {
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
