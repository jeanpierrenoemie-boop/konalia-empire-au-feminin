import { cn } from "@/lib/utils";

let _figSeq = 0;

export function FigTabs({ tabs }: {tabs: { id: string; label: string; node: React.ReactNode }[]}) {
  const name = `figtabs-${_figSeq++}`;
  return (
    <div className="lv-figtabs">
      <div className="lv-tabs">
        {tabs.map((t, i) => (
          <label key={t.id} className={cn("lv-tab")}>
            <input type="radio" name={name} defaultChecked={i === 0} />
            {t.label}
          </label>
        ))}
      </div>
      <div className="lv-figwrap">
        {tabs.map((t) => (
          <div className="lv-fig" key={t.id}>{t.node}</div>
        ))}
      </div>
    </div>
  );
}
