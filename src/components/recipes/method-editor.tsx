"use client";

import { Markdown } from "@/components/recipes/markdown";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

/**
 * The method field: a plain textarea with a preview toggle. SPEC.md §8 Phase 2.
 *
 * Deliberately not a rich-text editor. The method is stored as markdown
 * (SPEC.md §9 decision 4) and a plain textarea keeps paste-from-a-website
 * working, which is how most of these recipes will arrive.
 */
export function MethodEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Tabs defaultValue="write">
      <TabsList>
        <TabsTrigger value="write">Write</TabsTrigger>
        <TabsTrigger value="preview">Preview</TabsTrigger>
      </TabsList>

      <TabsContent value="write">
        <Textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={14}
          placeholder={"1. Heat the oven to 200C.\n2. …\n\nMarkdown works here."}
          className="font-mono text-sm"
        />
      </TabsContent>

      <TabsContent value="preview">
        <div className="min-h-56 rounded-md border p-3">
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
