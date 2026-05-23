import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Settings2, RotateCcw } from "lucide-react";
import {
  DEFAULT_OPTIONS,
  type ScrapeOptions,
} from "@/lib/types";

interface Props {
  options: ScrapeOptions;
  onChange: (o: ScrapeOptions) => void;
  disabled?: boolean;
}

export default function SettingsDrawer({ options, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ScrapeOptions>(options);

  function update<K extends keyof ScrapeOptions>(key: K, value: ScrapeOptions[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function listFromText(t: string) {
    return t
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function apply() {
    onChange(draft);
    setOpen(false);
  }

  function reset() {
    setDraft(DEFAULT_OPTIONS);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setDraft(options);
      }}
    >
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          data-testid="open-settings"
        >
          <Settings2 className="h-4 w-4 mr-2" />
          Settings
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto" side="right">
        <SheetHeader>
          <SheetTitle>Crawler settings</SheetTitle>
          <SheetDescription>
            Configure how DocuHarvest discovers and scrapes pages.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Max pages</Label>
              <span className="text-sm font-mono">{draft.maxPages}</span>
            </div>
            <Slider
              min={1}
              max={500}
              step={1}
              value={[draft.maxPages]}
              onValueChange={(v) => update("maxPages", v[0])}
              data-testid="slider-max-pages"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Max depth</Label>
              <span className="text-sm font-mono">{draft.maxDepth}</span>
            </div>
            <Slider
              min={0}
              max={8}
              step={1}
              value={[draft.maxDepth]}
              onValueChange={(v) => update("maxDepth", v[0])}
              data-testid="slider-max-depth"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Concurrency</Label>
              <span className="text-sm font-mono">{draft.concurrency}</span>
            </div>
            <Slider
              min={1}
              max={10}
              step={1}
              value={[draft.concurrency]}
              onValueChange={(v) => update("concurrency", v[0])}
              data-testid="slider-concurrency"
            />
          </div>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="include-input">Include URL patterns</Label>
            <Input
              id="include-input"
              placeholder="*/docs/*, */guide/*"
              value={draft.includePatterns.join(", ")}
              onChange={(e) =>
                update("includePatterns", listFromText(e.target.value))
              }
              data-testid="include-patterns"
            />
            <p className="text-xs text-muted-foreground">
              Comma or newline separated globs. Empty = include everything.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="exclude-input">Exclude URL patterns</Label>
            <Input
              id="exclude-input"
              placeholder="*/blog/*, */api/*"
              value={draft.excludePatterns.join(", ")}
              onChange={(e) =>
                update("excludePatterns", listFromText(e.target.value))
              }
              data-testid="exclude-patterns"
            />
          </div>

          <Separator />

          <ToggleRow
            label="Use sitemap.xml"
            description="Pre-seed the queue from the site's sitemap when available."
            value={draft.useSitemap}
            onChange={(v) => update("useSitemap", v)}
            testId="toggle-sitemap"
          />
          <ToggleRow
            label="Respect robots.txt"
            description="Honor the site's robots.txt disallow rules."
            value={draft.respectRobots}
            onChange={(v) => update("respectRobots", v)}
            testId="toggle-robots"
          />
          <ToggleRow
            label="Same origin only"
            description="Only follow links on the same hostname."
            value={draft.sameOriginOnly}
            onChange={(v) => update("sameOriginOnly", v)}
            testId="toggle-same-origin"
          />
          <ToggleRow
            label="JS rendering (slow)"
            description="Use a headless browser to render dynamic pages."
            value={draft.jsRender}
            onChange={(v) => update("jsRender", v)}
            testId="toggle-js"
          />
        </div>

        <SheetFooter className="gap-2">
          <Button
            variant="ghost"
            onClick={reset}
            data-testid="reset-settings"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset
          </Button>
          <Button onClick={apply} data-testid="apply-settings">
            Apply
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function ToggleRow({
  label,
  description,
  value,
  onChange,
  testId,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
  testId?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <Label className="text-sm">{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch
        checked={value}
        onCheckedChange={onChange}
        data-testid={testId}
      />
    </div>
  );
}
