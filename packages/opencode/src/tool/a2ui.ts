import z from "zod"
import { Tool } from "./tool"

const ChoiceOption = z.object({
  label: z.string(),
  value: z.string(),
})

const Component = z.object({
  id: z.string(),
  type: z.string(),
  children: z.array(z.string()).optional(),
  child: z.string().optional(),
  text: z.string().optional(),
  textStyle: z.string().optional(),
  variant: z.string().optional(),
  label: z.string().optional(),
  action: z.string().optional(),
  value: z.any().optional(),
  placeholder: z.string().optional(),
  options: z.array(ChoiceOption).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  gap: z.number().optional(),
  axis: z.string().optional(),
})

const Surface = z.object({
  id: z.string(),
  root: z.string(),
  components: z.array(Component),
})

export const A2UITool = Tool.define("a2ui_choice", {
  description: `Render interactive UI components in the terminal for the user to interact with.

WHEN TO USE:
- User needs to pick between 2-6 options (buttons)
- User needs to fill a short form (text fields, checkboxes, selects, sliders)
- Confirmation dialogs (yes/no)
- Do NOT use for informational output — only for actionable interaction

COMPONENT TYPES:
- Text: display text. Props: "text", "textStyle" ("title"/"body"/"caption")
- Button: selectable action. Props: "label", "action"
- TextField: text input. Props: "label", "value" (string), "variant" ("shortText"/"longText"/"number"/"obscured"), "placeholder"
- CheckBox: boolean toggle. Props: "label", "value" (boolean)
- ChoicePicker: select from options. Props: "label", "options" [{label,value}...], "value" (string[]), "variant" ("mutuallyExclusive"/"multipleSelection")
- Slider: numeric range. Props: "label", "value" (number), "min", "max"
- Divider: horizontal line
- Card: bordered container. Props: "child" (component ID)
- Column: vertical layout. Props: "children" [component IDs]
- Row: horizontal layout. Props: "children" [component IDs]

RULES:
- Surface must have: "id" (string), "root" (component ID), "components" (array)
- Each component needs: "id" and "type"
- Always include at least one Button so the user can submit
- The user interacts via arrow keys and enter in a dialog overlay
- Form field values are sent back as structured data when a button is pressed

EXAMPLE - simple choice:
{
  "surface": {
    "id": "pick", "root": "col",
    "components": [
      {"id": "col", "type": "Column", "children": ["q", "row"]},
      {"id": "q", "type": "Text", "text": "Which approach?", "textStyle": "title"},
      {"id": "row", "type": "Row", "children": ["a", "b"]},
      {"id": "a", "type": "Button", "label": "Refactor", "action": "refactor"},
      {"id": "b", "type": "Button", "label": "Rewrite", "action": "rewrite"}
    ]
  }
}

EXAMPLE - form with inputs:
{
  "surface": {
    "id": "config", "root": "col",
    "components": [
      {"id": "col", "type": "Column", "children": ["title", "name", "lang", "strict", "submit"]},
      {"id": "title", "type": "Text", "text": "Project Setup", "textStyle": "title"},
      {"id": "name", "type": "TextField", "label": "Project Name", "value": "", "placeholder": "my-app"},
      {"id": "lang", "type": "ChoicePicker", "label": "Language", "options": [{"label": "Go", "value": "go"}, {"label": "Rust", "value": "rust"}, {"label": "Python", "value": "python"}], "value": [], "variant": "mutuallyExclusive"},
      {"id": "strict", "type": "CheckBox", "label": "Enable strict mode", "value": false},
      {"id": "submit", "type": "Button", "label": "Create Project", "action": "create"}
    ]
  }
}`,
  parameters: z.object({
    surface: Surface.describe("A2UI surface JSON with id, root, and components"),
  }),
  async execute(params, ctx) {
    const surface = params.surface
    const buttons = surface.components.filter((c) => c.type === "Button")
    const labels = buttons.map((b) => b.label ?? b.text ?? b.id)

    return {
      title: labels.join(" | "),
      output: JSON.stringify(surface),
      metadata: {
        surface,
        buttonLabels: labels,
      },
    }
  },
})

export type A2UISurface = z.infer<typeof Surface>
export type A2UIComponent = z.infer<typeof Component>
