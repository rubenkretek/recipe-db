"use client";

import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef } from "react";

import { Markdown } from "@/components/recipes/markdown";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type CursorRange = { start: number; end: number };
type Edit = { text: string; selection: CursorRange };

/**
 * Any block prefix this toolbar knows how to apply.
 *
 * Used to strip whatever a line already has before applying something else, so
 * turning a bullet into a heading replaces the marker rather than stacking
 * "- ## " in front of it.
 */
const ANY_BLOCK_PREFIX = /^\s*(?:[-*+]\s+|\d+\.\s+|>\s+|#{1,6}\s+)/;

/**
 * Wraps the selection in a marker, or unwraps it if it is already wrapped.
 *
 * Handles the markers sitting either inside the selection or just outside it,
 * because after wrapping we leave the selection around the inner text — so
 * pressing the same button again has to recognise that and undo it.
 */
function toggleWrap(text: string, range: CursorRange, marker: string): Edit {
  const { start, end } = range;
  const width = marker.length;
  const selected = text.slice(start, end);

  if (
    start >= width &&
    text.slice(start - width, start) === marker &&
    text.slice(end, end + width) === marker
  ) {
    return {
      text: text.slice(0, start - width) + selected + text.slice(end + width),
      selection: { start: start - width, end: end - width },
    };
  }

  if (
    selected.length >= width * 2 &&
    selected.startsWith(marker) &&
    selected.endsWith(marker)
  ) {
    const inner = selected.slice(width, -width);
    return {
      text: text.slice(0, start) + inner + text.slice(end),
      selection: { start, end: start + inner.length },
    };
  }

  return {
    text: text.slice(0, start) + marker + selected + marker + text.slice(end),
    selection: { start: start + width, end: end + width },
  };
}

/** Expands a selection to cover whole lines, which block markers apply to. */
function lineBoundaries(text: string, range: CursorRange): CursorRange {
  const start = text.lastIndexOf("\n", range.start - 1) + 1;
  const newline = text.indexOf("\n", range.end);
  return { start, end: newline === -1 ? text.length : newline };
}

/**
 * Adds a block prefix to every selected line, or strips it if every line
 * already has it. Blank lines are left alone so a paragraph break does not
 * become an empty bullet.
 */
function toggleLinePrefix(
  text: string,
  range: CursorRange,
  pattern: RegExp,
  prefixFor: (ordinal: number) => string,
): Edit {
  const block = lineBoundaries(text, range);
  const lines = text.slice(block.start, block.end).split("\n");
  const written = lines.filter((line) => line.trim() !== "");

  const alreadyApplied =
    written.length > 0 && written.every((line) => pattern.test(line));

  let ordinal = 0;
  const nextLines = lines.map((line) => {
    if (line.trim() === "") return line;
    ordinal += 1;
    const bare = line.replace(ANY_BLOCK_PREFIX, "");
    return alreadyApplied ? bare : prefixFor(ordinal) + bare;
  });

  const rewrittenBlock = nextLines.join("\n");
  return {
    text: text.slice(0, block.start) + rewrittenBlock + text.slice(block.end),
    selection: { start: block.start, end: block.start + rewrittenBlock.length },
  };
}

/** Inserts a markdown link, leaving "url" selected so it can be typed over. */
function insertLink(text: string, range: CursorRange): Edit {
  const selected = text.slice(range.start, range.end) || "text";
  const snippet = `[${selected}](url)`;
  // Past the opening bracket, the label, and the "](" that follows it.
  const urlStart = range.start + selected.length + 3;

  return {
    text: text.slice(0, range.start) + snippet + text.slice(range.end),
    selection: { start: urlStart, end: urlStart + "url".length },
  };
}

/** Wrapping markers, kept here so the toolbar and the shortcuts agree. */
const BOLD = "**";
const ITALIC = "_";

type ToolbarAction =
  | { separator: true }
  | {
      label: string;
      icon: LucideIcon;
      edit: (text: string, range: CursorRange) => Edit;
    };

/**
 * The toolbar, as data.
 *
 * Deliberately module-level and made only of pure text transforms: nothing here
 * closes over component state or a ref, so the buttons are just a list and the
 * editing rules above stay independently readable.
 */
const TOOLBAR_ACTIONS: ToolbarAction[] = [
  {
    label: "Heading",
    icon: Heading2,
    edit: (text, range) =>
      toggleLinePrefix(text, range, /^\s*##\s+/, () => "## "),
  },
  {
    label: "Subheading",
    icon: Heading3,
    edit: (text, range) =>
      toggleLinePrefix(text, range, /^\s*###\s+/, () => "### "),
  },
  { separator: true },
  {
    label: "Bold",
    icon: Bold,
    edit: (text, range) => toggleWrap(text, range, BOLD),
  },
  {
    label: "Italic",
    icon: Italic,
    edit: (text, range) => toggleWrap(text, range, ITALIC),
  },
  { separator: true },
  {
    label: "Bulleted list",
    icon: List,
    edit: (text, range) =>
      toggleLinePrefix(text, range, /^\s*[-*+]\s+/, () => "- "),
  },
  {
    label: "Numbered list",
    icon: ListOrdered,
    edit: (text, range) =>
      toggleLinePrefix(text, range, /^\s*\d+\.\s+/, (ordinal) => `${ordinal}. `),
  },
  {
    label: "Quote",
    icon: Quote,
    edit: (text, range) => toggleLinePrefix(text, range, /^\s*>\s+/, () => "> "),
  },
  { separator: true },
  { label: "Link", icon: Link2, edit: insertLink },
];

/**
 * The method field: a markdown textarea with a formatting toolbar and a
 * preview. SPEC.md §8 Phase 2.
 *
 * Still a plain textarea underneath rather than a rich-text editor, because the
 * method is stored as markdown (SPEC.md §9 decision 4) and pasting a method
 * straight off a website has to keep working. The toolbar exists so the
 * markdown is discoverable: nothing else on the page tells you that "##" makes
 * a heading.
 */
export function MethodEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingSelection = useRef<CursorRange | null>(null);

  // The parent owns the value, so the textarea re-renders before the caret can
  // be placed. Restoring it here keeps typing flowing after a toolbar press
  // instead of dumping the cursor at the end of the field.
  useEffect(() => {
    const textarea = textareaRef.current;
    const selection = pendingSelection.current;

    if (textarea && selection) {
      pendingSelection.current = null;
      textarea.focus();
      textarea.setSelectionRange(selection.start, selection.end);
    }
  });

  function applyEdit(edit: (text: string, range: CursorRange) => Edit) {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const result = edit(value, {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
    });

    pendingSelection.current = result.selection;
    onChange(result.text);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!event.metaKey && !event.ctrlKey) return;

    const key = event.key.toLowerCase();
    if (key === "b") {
      event.preventDefault();
      applyEdit((text, range) => toggleWrap(text, range, BOLD));
    } else if (key === "i") {
      event.preventDefault();
      applyEdit((text, range) => toggleWrap(text, range, ITALIC));
    }
  }

  return (
    <Tabs defaultValue="write">
      <TabsList>
        <TabsTrigger value="write">Write</TabsTrigger>
        <TabsTrigger value="preview">Preview</TabsTrigger>
      </TabsList>

      <TabsContent value="write" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-0.5 rounded-md border p-1">
          {TOOLBAR_ACTIONS.map((action, index) =>
            "separator" in action ? (
              <Separator
                key={`separator-${index}`}
                orientation="vertical"
                className="mx-1 h-5!"
              />
            ) : (
              <Button
                key={action.label}
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                title={action.label}
                aria-label={action.label}
                onClick={() => applyEdit(action.edit)}
              >
                <action.icon className="size-4" />
              </Button>
            ),
          )}
        </div>

        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          rows={14}
          placeholder={"Heat the oven to 200C.\n\nMarkdown works here."}
          className="min-h-64 font-mono text-sm"
        />
      </TabsContent>

      <TabsContent value="preview">
        <div className="min-h-64 rounded-md border p-3">
          {value.trim() ? (
            <Markdown>{value}</Markdown>
          ) : (
            <p className="text-muted-foreground text-sm">Nothing to preview.</p>
          )}
        </div>
      </TabsContent>
    </Tabs>
  );
}
