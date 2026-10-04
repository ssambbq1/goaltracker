"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AGENT_PERSONAS, type AgentPersonaId } from "../../lib/agentPersonas";

export function AgentPersonaAvatar({ persona, usePhoto, fallback, size = 32 }: {
  persona: AgentPersonaId; usePhoto: boolean; fallback: ReactNode; size?: number;
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const source = persona === "general" ? null : persona === "joo-eon-gyu" ? "/personas/joo-eon-gyu-user.png" : `/personas/${persona}.jpg`;
  if (source && usePhoto && failedSource !== source) {
    return <span className="agent-persona-avatar" style={{ display: "inline-flex", overflow: "hidden", width: size, height: size }}>
      <Image key={source} src={source} alt="" width={size} height={size} sizes={`${size}px`} style={{ objectFit: "cover", objectPosition: "center 35%" }} onError={() => setFailedSource(source)} />
    </span>;
  }
  return persona === "joo-eon-gyu"
    ? <span className="agent-persona-initial" style={{ width: size, height: size }} aria-hidden="true">J</span>
    : <>{fallback}</>;
}

export default function AgentPersonaMenu({ persona, onChange, usePhoto, onPhotoChange, disabled, language, robot }: {
  persona: AgentPersonaId; onChange: (persona: AgentPersonaId) => void;
  usePhoto: boolean; onPhotoChange: (value: boolean) => void;
  disabled: boolean; language: "ko" | "en"; robot: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const ko = language === "ko";
  const selected = AGENT_PERSONAS.find((entry) => entry.id === persona)!;
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return <div ref={container} className="agent-persona-menu" onKeyDown={(event) => {
    if (event.key === "Escape" && open) {
      event.stopPropagation(); setOpen(false); trigger.current?.focus();
    }
  }}>
    <button ref={trigger} type="button" className="agent-persona-trigger" disabled={disabled} aria-expanded={open} aria-controls="agent-persona-options" aria-label={`${ko ? "Agent 모드 선택" : "Select Agent mode"}: ${ko ? selected.ko : selected.en}`} onClick={() => setOpen(!open)}>
      <span className="agent-persona-trigger-label">{ko ? selected.ko : selected.en}</span>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </button>
    {open && <div id="agent-persona-options" className="agent-persona-options" role="group" aria-label={ko ? "Agent 모드" : "Agent mode"}>
      {AGENT_PERSONAS.map((entry) => <button key={entry.id} type="button" disabled={disabled} aria-pressed={persona === entry.id} className="agent-persona-option" onClick={() => { onChange(entry.id); setOpen(false); trigger.current?.focus(); }}>
        <span className="agent-persona-option-icon"><AgentPersonaAvatar persona={entry.id} usePhoto={true} fallback={robot} /></span>
        <span className="agent-persona-option-text"><strong>{ko ? entry.ko : entry.en}</strong><small>{ko ? entry.descriptionKo : entry.descriptionEn}</small></span>
        <span aria-hidden="true">{persona === entry.id ? "✓" : ""}</span>
      </button>)}
      <label className="agent-persona-photo-option"><input type="checkbox" checked={usePhoto} disabled={disabled} onChange={(event) => onPhotoChange(event.target.checked)} />{ko ? "페르소나 얼굴 사진 사용" : "Use persona portrait"}</label>
      <p className="agent-persona-credit">Photo: <a href="https://commons.wikimedia.org/wiki/File:Jordan_Peterson_by_Gage_Skidmore_(face_only).jpg" target="_blank" rel="noreferrer">Gage Skidmore</a> · <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noreferrer">CC BY-SA 3.0</a></p>
      <p className="agent-persona-credit">{ko ? "주언규: 사용자 제공 사진" : "Joo Eon-gyu: user-provided portrait"}</p>
    </div>}
  </div>;
}
