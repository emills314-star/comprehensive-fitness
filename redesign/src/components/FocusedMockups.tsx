import { useState, type CSSProperties, type ReactNode } from "react";

type MockupView = "workout" | "edit" | "templates" | "recommendations" | "warnings";
type DirectionId = "dual" | "weekline" | "mission" | "editorial" | "coach";

const views: Array<{ id: MockupView; label: string }> = [
  { id: "workout", label: "Inside workout" },
  { id: "edit", label: "Change reps & sets" },
  { id: "templates", label: "Pick template" },
  { id: "recommendations", label: "Recommendations" },
  { id: "warnings", label: "Warning flags" },
];

const directions: Array<{ id: DirectionId; name: string; note: string; theme: Record<string, string> }> = [
  { id: "dual", name: "Dual Track", note: "Exercise lanes over a logging dock", theme: { canvas: "#F2F7FB", surface: "#FFFFFF", ink: "#15243A", muted: "#617189", accent: "#2B7FFF", soft: "#E5EFFF" } },
  { id: "weekline", name: "Weekline", note: "The session unfolds on a time spine", theme: { canvas: "#F4F0FF", surface: "#FFFFFF", ink: "#241A3A", muted: "#6A5B7B", accent: "#6F4EF2", soft: "#E9E1FF" } },
  { id: "mission", name: "Mission Control", note: "Exercise stages feed a telemetry log", theme: { canvas: "#F2F7FB", surface: "#FFFFFF", ink: "#15243A", muted: "#617189", accent: "#2B7FFF", soft: "#E5EFFF" } },
  { id: "editorial", name: "Editorial Performance", note: "Coaching notes frame a compact ledger", theme: { canvas: "#F2F7FB", surface: "#FFFFFF", ink: "#15243A", muted: "#617189", accent: "#2B7FFF", soft: "#E5EFFF" } },
  { id: "coach", name: "Coach Thread", note: "Guidance scrolls above a pinned quick log", theme: { canvas: "#EEF2F6", surface: "#FFFFFF", ink: "#17212B", muted: "#607080", accent: "#0F6CBD", soft: "#DCEAF7" } },
];

const viewCopy: Record<MockupView, { eyebrow: string; title: string }> = {
  workout: { eyebrow: "Exercise 1 of 4", title: "Bench Press" },
  edit: { eyebrow: "Today only", title: "Edit Bench Press" },
  templates: { eyebrow: "Start a session", title: "Choose a template" },
  recommendations: { eyebrow: "Progression available", title: "Hold load, add a rep" },
  warnings: { eyebrow: "Safety hold", title: "Pressing needs review" },
};

function Phone({ direction, view, children }: { direction: (typeof directions)[number]; view: MockupView; children: ReactNode }) {
  const style = {
    "--mock-canvas": direction.theme.canvas,
    "--mock-surface": direction.theme.surface,
    "--mock-ink": direction.theme.ink,
    "--mock-muted": direction.theme.muted,
    "--mock-accent": direction.theme.accent,
    "--mock-soft": direction.theme.soft,
  } as CSSProperties;
  return (
    <article className="focus-concept">
      <header><div><strong>{direction.name}</strong><span>{direction.note}</span></div><b>{views.findIndex((item) => item.id === view) + 1}/5</b></header>
      <div className={`focus-phone focus-phone-${direction.id}`} style={style} aria-label={`${direction.name}: ${views.find((item) => item.id === view)?.label}`}>
        <div className="focus-phone-status"><span>9:41</span><span>● ◔ ▰</span></div>
        {children}
        <div className="focus-home" />
      </div>
    </article>
  );
}

function SessionBar({ compact = false }: { compact?: boolean }) {
  return <div className={`session-bar ${compact ? "compact" : ""}`}>
    <button type="button" className="session-close" aria-label="Leave workout">×</button>
    <div><span>UPPER A</span><strong>24:18</strong></div>
    <button type="button" className="session-finish">Finish</button>
  </div>;
}

const setRows = [
  { set: "W", previous: "95 × 10", load: "95", reps: "10", rpe: "", done: true },
  { set: "1", previous: "165 × 9", load: "165", reps: "9", rpe: "8", done: true },
  { set: "2", previous: "165 × 8", load: "165", reps: "9", rpe: "8", done: false },
  { set: "3", previous: "160 × 10", load: "165", reps: "8", rpe: "", done: false },
];

function SetLogger({ mode, label = "Bench Press" }: { mode: "workout" | "edit" | "recommendations" | "warnings"; label?: string }) {
  return <section className={`set-logger set-logger-${mode}`} aria-label={`${label} set logger`}>
    <header className="logger-exercise">
      <div><span>{mode === "warnings" ? "PROGRESSION PAUSED" : "3 × 8–10 · REST 2:30"}</span><strong>{label}</strong></div>
      <button type="button" aria-label={`More options for ${label}`}>•••</button>
    </header>
    <details className="logger-prescription" open={mode === "warnings"}>
      <summary>{mode === "warnings" ? "Why this is paused" : "Prescription & form cues"}</summary>
      <p>{mode === "warnings" ? "Shoulder discomfort overrides planned progression. Use a confirmed pain-free substitute or remove this exercise." : "Keep two reps in reserve. Progress only when both back-off sets stay in range with stable technique."}</p>
    </details>
    <div className="logger-table" role="table" aria-label={`${label} sets`}>
      <div className="logger-head" role="row">
        <span role="columnheader">Set</span><span role="columnheader">Previous</span><span role="columnheader">lb</span><span role="columnheader">Reps</span><span role="columnheader">Done</span>
      </div>
      {setRows.map((row, index) => <div className={`logger-row ${row.done ? "completed" : ""} ${mode === "edit" && index === 2 ? "editing" : ""}`} role="row" key={row.set}>
        <button type="button" className="set-type" aria-label={`Set ${row.set} type`}>{row.set}</button>
        <span className="set-previous" role="cell">{row.previous}</span>
        <input aria-label={`Set ${row.set} load in pounds`} defaultValue={row.load} />
        <label><span className="sr-only">Set {row.set} repetitions</span><input aria-label={`Set ${row.set} repetitions`} defaultValue={row.reps} />{row.rpe && <em>{row.rpe}</em>}</label>
        <button type="button" className="set-done" aria-label={`${row.done ? "Completed" : "Complete"} set ${row.set}`}>{row.done ? "✓" : "○"}</button>
        {index === 1 && mode === "workout" && <div className="rest-strip" role="timer" aria-label="Rest timer, 1 minute 54 seconds remaining"><i style={{ width: "76%" }} /><strong>1:54</strong><button type="button">Skip</button></div>}
      </div>)}
    </div>
    {mode === "edit" && <div className="set-edit-sheet">
      <span>EDIT SET 2</span>
      <div><button type="button">−</button><strong>165 lb × 9</strong><button type="button">+</button></div>
      <div className="edit-actions"><button type="button">Warm-up</button><button type="button">Duplicate</button><button type="button" className="danger">Remove</button></div>
    </div>}
    <button type="button" className="add-set">+ Add set · 2:30 rest</button>
  </section>;
}

function RecommendationCard({ tone = "recommendation" }: { tone?: "recommendation" | "warning" }) {
  return <aside className={`decision-card ${tone}`}>
    <span>{tone === "warning" ? "SAFETY OVERRIDE" : "WHY THIS TARGET"}</span>
    <strong>{tone === "warning" ? "Do not progress Bench Press" : "Keep 165 lb · aim for 9 reps"}</strong>
    <p>{tone === "warning" ? "Moderate shoulder soreness conflicts with horizontal pressing." : "Two recent sessions were productive, but both back-offs have not yet earned a load increase."}</p>
    <div><button type="button">{tone === "warning" ? "See substitutes" : "Use target"}</button><button type="button" className="quiet">Evidence</button></div>
  </aside>;
}

function TemplateGrid({ variant }: { variant: DirectionId }) {
  const templates = [
    { name: "Upper A", exercises: "Bench · Row · Raise", meta: "Last used Tue · 56 min" },
    { name: "Heavy Pull", exercises: "Pulldown · Row · Curl", meta: "Last used Thu · 51 min" },
    { name: "Heavy Lower", exercises: "Leg Press · RDL · Calf", meta: "Last used Sat · 62 min" },
    { name: "Light Upper", exercises: "Cable Press · Row · Arms", meta: "Last used Sun · 48 min" },
  ];
  return <div className={`template-browser template-browser-${variant}`}>
    <div className="template-tools"><strong>{variant === "mission" ? "PROGRAM MANIFESTS" : variant === "editorial" ? "THE PROGRAM INDEX" : "My templates · 4"}</strong><button type="button" aria-label="Search templates">⌕</button></div>
    <div className="template-list">{templates.map((template, index) => <button type="button" className={index === 0 ? "selected" : ""} key={template.name}>
      <span>{variant === "mission" ? `A-0${index + 1}` : `0${index + 1}`}</span><strong>{template.name}</strong><p>{template.exercises}</p><em>{template.meta}</em>
    </button>)}</div>
    <button type="button" className="template-start">Start Upper A</button>
  </div>;
}

function ExerciseActions() {
  return <div className="session-actions"><button type="button">+ Add exercise</button><button type="button" className="cancel">Cancel workout</button></div>;
}

function DualTrack({ view }: { view: MockupView }) {
  const copy = viewCopy[view];
  if (view === "templates") return <div className="dual-screen"><div className="mock-title"><span>{copy.eyebrow}</span><h3>{copy.title}</h3></div><TemplateGrid variant="dual" /></div>;
  return <div className="dual-screen">
    <SessionBar />
    <div className="dual-track-nav" aria-label="Workout exercise lanes"><button type="button" className="done">Bench<strong>2/4</strong></button><button type="button">Row<strong>0/3</strong></button><button type="button">Raise<strong>0/3</strong></button><i /></div>
    {view === "recommendations" && <RecommendationCard />}
    {view === "warnings" && <RecommendationCard tone="warning" />}
    <div className="dual-log-dock"><SetLogger mode={view} /></div>
    {view === "workout" && <ExerciseActions />}
  </div>;
}

function Weekline({ view }: { view: MockupView }) {
  const copy = viewCopy[view];
  if (view === "templates") return <div className="weekline-screen"><div className="mock-title"><span>{copy.eyebrow}</span><h3>{copy.title}</h3></div><div className="week-template-spine"><time>RECENT</time><TemplateGrid variant="weekline" /></div></div>;
  return <div className="weekline-screen">
    <SessionBar compact />
    <div className="week-session-spine"><div className="past"><time>9:17</time><i /><span>Readiness complete</span></div><div className="active"><time>NOW</time><i /><span>Bench Press · set 3</span></div><div><time>NEXT</time><i /><span>Chest-supported Row</span></div></div>
    <div className="week-active-event"><div className="mock-title"><span>{copy.eyebrow}</span><h3>{copy.title}</h3></div>{view === "recommendations" && <RecommendationCard />}{view === "warnings" && <RecommendationCard tone="warning" />}<SetLogger mode={view} /></div>
    {view === "workout" && <ExerciseActions />}
  </div>;
}

function Mission({ view }: { view: MockupView }) {
  const copy = viewCopy[view];
  if (view === "templates") return <div className="mission-screen"><div className="mission-command"><span>CF / MANIFEST</span><b>SELECT ROUTE</b></div><div className="mock-title"><span>{copy.eyebrow}</span><h3>{copy.title}</h3></div><TemplateGrid variant="mission" /></div>;
  return <div className="mission-screen">
    <div className="mission-command"><span>CF / LIVE · 24:18</span><b>{view === "warnings" ? "HOLD" : "NOMINAL"}</b><button type="button">Finish</button></div>
    <div className="mission-stages"><span className="done">01 CHECK</span><span className="live">02 PRESS</span><span>03 PULL</span><span>04 ACCESSORY</span></div>
    <div className="mock-title"><span>{copy.eyebrow}</span><h3>{copy.title}</h3></div>
    {view === "recommendations" && <RecommendationCard />}
    {view === "warnings" && <RecommendationCard tone="warning" />}
    <div className="mission-telemetry"><span>LIVE SET TELEMETRY</span><SetLogger mode={view} /></div>
    {view === "workout" && <ExerciseActions />}
  </div>;
}

function Editorial({ view }: { view: MockupView }) {
  const copy = viewCopy[view];
  if (view === "templates") return <div className="editorial-screen"><div className="editorial-mast"><strong>THE TRAINING EDITION</strong><span>PROGRAMS · NO. 042</span></div><div className="mock-title"><span>{copy.eyebrow}</span><h3>{copy.title}</h3></div><TemplateGrid variant="editorial" /></div>;
  return <div className="editorial-screen">
    <div className="editorial-mast"><strong>THE TRAINING EDITION</strong><span>24:18 · <button type="button">FINISH</button></span></div>
    <div className="mock-title"><span>{copy.eyebrow}</span><h3>{copy.title}</h3></div>
    {view === "workout" && <div className="editorial-deck"><strong>Back-off one is complete.</strong><p>Rest 2:30, then repeat the load while keeping two reps in reserve.</p></div>}
    {view === "recommendations" && <RecommendationCard />}
    {view === "warnings" && <RecommendationCard tone="warning" />}
    <div className="editorial-ledger"><span>THE SET LEDGER</span><SetLogger mode={view} /></div>
    {view === "workout" && <ExerciseActions />}
  </div>;
}

function CoachThread({ view }: { view: MockupView }) {
  const copy = viewCopy[view];
  if (view === "templates") return <div className="coach-focus-screen"><div className="mock-title"><span>{copy.eyebrow}</span><h3>{copy.title}</h3></div><div className="coach-message"><span>COACH</span><p>Upper A is the best match for today’s plan and available equipment.</p></div><TemplateGrid variant="coach" /></div>;
  return <div className="coach-focus-screen">
    <SessionBar compact />
    <div className="coach-thread-head"><div className="coach-message"><span>COACH</span><p>{view === "warnings" ? "I paused pressing because your soreness response conflicts with the planned progression." : view === "recommendations" ? "Keep 165 pounds today and earn one more rep before adding load." : view === "edit" ? "Your edit applies to today only; the template stays unchanged." : "Back-off one is logged. Rest, then repeat 165 pounds for 8–10 reps."}</p></div></div>
    {(view === "recommendations" || view === "warnings") && <RecommendationCard tone={view === "warnings" ? "warning" : "recommendation"} />}
    <div className="coach-quick-log"><span>QUICK LOG · ALWAYS AVAILABLE</span><SetLogger mode={view} /></div>
    {view === "workout" && <ExerciseActions />}
  </div>;
}

const renderers: Record<DirectionId, (view: MockupView) => ReactNode> = {
  dual: (view) => <DualTrack view={view} />,
  weekline: (view) => <Weekline view={view} />,
  mission: (view) => <Mission view={view} />,
  editorial: (view) => <Editorial view={view} />,
  coach: (view) => <CoachThread view={view} />,
};

export function FocusedMockups() {
  const [view, setView] = useState<MockupView>("workout");
  return <section className="focused-mockups" aria-labelledby="focused-mockups-title">
    <div className="section-heading"><span className="kicker">Five session systems · 25 screens</span><h2 id="focused-mockups-title">A serious set logger, expressed five different ways.</h2><p>Each option now preserves the fast, dense controls lifters expect—previous work, set types, editable load and reps, completion, rest, and session actions—while retaining a genuinely different navigation and presentation model.</p></div>
    <div className="focus-view-tabs" role="tablist" aria-label="Mockup screen">
      {views.map((item) => <button type="button" role="tab" aria-selected={view === item.id} key={item.id} onClick={() => setView(item.id)}>{item.label}</button>)}
    </div>
    <div className="focus-grid">{directions.map((direction) => <Phone direction={direction} view={view} key={direction.id}>{renderers[direction.id](view)}</Phone>)}</div>
  </section>;
}
