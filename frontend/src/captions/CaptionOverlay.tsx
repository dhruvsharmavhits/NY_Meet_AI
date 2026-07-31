import type { Caption } from "@/meeting/types";

interface CaptionOverlayProps {
  captions: Caption[];
  myLanguage: string;
  position: "top" | "bottom";
  showOriginal: boolean;
  fontSize: number;
}

function colorForName(name: string): string {
  const colors = [
    "#c58af9", "#8ab4f8", "#fcad70", "#81c995", "#f28b82",
    "#78d9ec", "#fdd663", "#a8dab5", "#f6aea9", "#b39ddb",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export function CaptionOverlay({ captions, myLanguage, position, showOriginal, fontSize }: CaptionOverlayProps) {
  const recent = captions.slice(-3);
  if (recent.length === 0) return null;

  return (
    <div
      className={`pointer-events-none absolute inset-x-0 z-[5] flex flex-col items-center gap-1.5 px-8 ${
        position === "top" ? "top-4" : "bottom-6"
      }`}
    >
      {recent.map((c, i) => {
        const translated = c.translations[myLanguage];
        const displayText = showOriginal || !translated ? c.text : translated;
        const displayLang = showOriginal || !translated ? c.lang : myLanguage;

        return (
          <div
            key={`${c.sid}-${c.ts}-${i}`}
            className="max-w-3xl rounded-lg bg-[#202124]/90 px-4 py-2 text-center backdrop-blur-sm animate-meet-fade-in"
            style={{ fontSize }}
          >
            <span className="mr-2 font-medium" style={{ color: colorForName(c.full_name) }}>
              {c.full_name}
            </span>
            <span className="text-white">{displayText}</span>
            <span className="ml-2 inline-flex items-center rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-medium uppercase text-white/70">
              {displayLang}
            </span>
          </div>
        );
      })}
    </div>
  );
}
