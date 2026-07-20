import { useState, type CSSProperties, type ReactNode } from "react";

type MockupView = "workout" | "edit" | "templates" | "recommendations" | "warnings";
type DirectionId = "dual" | "weekline" | "mission" | "editorial" | "atlas" | "coach";

const views: Array<{ id: MockupView; label: string }> = [
  { id: "workout", label: "Inside workout" },
  { id: "edit", label: "Change reps & sets" },
  { id: "templates", label: "Pick template" },
  { id: "recommendations", label: "Recommendations" },
  { id: "warnings", label: "Warning flags" },
];

const directions: Array<{ id: DirectionId; name: string; note: string; theme: Record<string, string> }> = [
  { id: "dual", name: "Dual Track", note: "Parallel exercise lanes + control dock", theme: { canvas: "#F2F7FB", surface: "#FFFFFF", ink: "#15243A", muted: "#617189", accent: "#2B7FFF", soft: "#E5EFFF" } },
  { id: "weekline", name: "Weekline", note: "Training organized around time", theme: { canvas: "#F4F0FF", surface: "#FFFFFF", ink: "#241A3A", muted: "#6A5B7B", accent: "#6F4EF2", soft: "#E9E1FF" } },
  { id: "mission", name: "Mission Control", note: "Checks, stages, telemetry, debrief", theme: { canvas: "#F2F7FB", surface: "#FFFFFF", ink: "#15243A", muted: "#617189", accent: "#2B7FFF", soft: "#E5EFFF" } },
  { id: "editorial", name: "Editorial Performance", note: "Training as a concise publication", theme: { canvas: "#F2F7FB", surface: "#FFFFFF", ink: "#15243A", muted: "#617189", accent: "#2B7FFF", soft: "#E5EFFF" } },
  { id: "atlas", name: "Body Atlas", note: "Muscle regions as primary navigation", theme: { canvas: "#EAF4F2", surface: "#F9FFFD", ink: "#153F3A", muted: "#486A63", accent: "#006B5D", soft: "#D8EEEA" } },
  { id: "coach", name: "Coach Thread", note: "Deterministic guidance in sequence", theme: { canvas: "#EEF2F6", surface: "#FFFFFF", ink: "#17212B", muted: "#607080", accent: "#0F6CBD", soft: "#DCEAF7" } },
];

const viewCopy: Record<MockupView, { eyebrow: string; title: string }> = {
  workout: { eyebrow: "Set 3 of 10", title: "Upper A in progress" },
  edit: { eyebrow: "Edit current work", title: "Bench Press" },
  templates: { eyebrow: "Start a session", title: "Choose a template" },
  recommendations: { eyebrow: "Today’s guidance", title: "Take the planned progression" },
  warnings: { eyebrow: "Review needed", title: "One flag changes today" },
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

function DualTrack({ view }: { view: MockupView }) {
  const copy = viewCopy[view];
  return <div className="dual-screen">
    <div className="mock-title"><span>{copy.eyebrow}</span><h3>{copy.title}</h3></div>
    {view === "workout" && <><div className="dual-lanes"><div><strong>Bench press</strong><i className="done">W</i><i className="done">T</i><i className="live">B1</i><i>B2</i></div><div><strong>Chest row</strong><i>T</i><i>B1</i><i>B2</i></div><div><strong>Lateral raise</strong><i>T</i><i>B1</i><i>B2</i></div><em /></div><div className="dual-dock"><span>CURRENT SET · BACK-OFF 1</span><strong>165 lb × 9 <small>@ 8</small></strong><button type="button">Complete set</button></div></>}
    {view === "edit" && <><div className="dual-editor"><div><span>LOAD</span><button type="button">−</button><strong>165 <small>lb</small></strong><button type="button">+</button></div><div><span>REPS</span><button type="button">−</button><strong>9</strong><button type="button">+</button></div><div><span>SETS</span><button type="button">−</button><strong>4</strong><button type="button">+</button></div></div><div className="dual-dock"><span>PREVIEW</span><strong>Top · B1 · B2 · B3</strong><button type="button">Apply changes</button></div></>}
    {view === "templates" && <div className="dual-arrangements"><button type="button" className="selected"><span>4 tracks · 10 sets</span><strong>Upper A</strong><em>Last used Tuesday</em></button><button type="button"><span>5 tracks · 14 sets</span><strong>Full Body A</strong><em>Balanced session</em></button><button type="button"><span>3 tracks · 9 sets</span><strong>Push</strong><em>Chest · delts · triceps</em></button></div>}
    {view === "recommendations" && <><div className="dual-rec-track"><span>LAST</span><i>160 × 10</i><i>165 × 8</i><i>165 × 8</i><b>→</b><span>TODAY</span><i className="target">165 × 9</i><i className="target">165 × 9</i></div><div className="dual-dock"><span>RECOMMENDED SIGNAL</span><strong>Hold load · add one rep</strong><button type="button">Use recommendation</button></div></>}
    {view === "warnings" && <><div className="dual-warning-lane"><strong>Shoulder soreness</strong><span>Bench lane paused</span><em>!</em></div><div className="dual-warning-lane mild"><strong>Back-off evidence</strong><span>Load increase held</span><em>i</em></div><div className="dual-dock warning"><span>SAFE NEXT ACTION</span><strong>Review pain-free substitute</strong><button type="button">Open options</button></div></>}
  </div>;
}

function Weekline({ view }: { view: MockupView }) {
  const copy = viewCopy[view];
  const entries: Record<MockupView, Array<[string, string, string]>> = {
    workout: [["9:41", "Bench press", "Back-off 1 · 165 × 9"], ["REST", "2:30", "Chest row is next"], ["10:02", "Chest row", "3 × 8–12"]],
    edit: [["NOW", "Bench press", "4 sets · 6–10 reps"], ["EDIT", "Reps", "6–10 → 8–10"], ["EDIT", "Sets", "4 → 3"]],
    templates: [["56m", "Upper A", "10 sets · Recommended"], ["48m", "Push", "9 sets"], ["62m", "Full Body A", "14 sets"]],
    recommendations: [["W3", "160 × 10", "Completed"], ["W4", "165 × 8", "Completed"], ["TODAY", "165 × 9", "Planned progression"]],
    warnings: [["TODAY", "Shoulder soreness", "Moderate · review"], ["9:41", "Bench press", "Progression paused"], ["NEXT", "Cable press", "Pain-free option"]],
  };
  return <div className="weekline-screen"><div className="mock-title"><span>{copy.eyebrow}</span><h3>{copy.title}</h3></div><div className="week-spine">{entries[view].map(([time, title, detail], index) => <div className={index === 0 ? "active" : ""} key={`${time}-${title}`}><time>{time}</time><i /><article><strong>{title}</strong><span>{detail}</span>{view === "templates" && index === 0 && <button type="button">Start</button>}{view === "edit" && index > 0 && <div className="week-stepper"><button type="button">−</button><b>{index === 1 ? "8–10" : "3"}</b><button type="button">+</button></div>}</article></div>)}</div><button type="button" className="week-action">{view === "warnings" ? "Review flag" : view === "templates" ? "Use Upper A" : "Continue"}</button></div>;
}

function Mission({ view }: { view: MockupView }) {
  const copy = viewCopy[view];
  return <div className="mission-screen"><div className="mission-top"><span>CF / {view.toUpperCase()}</span><b>{view === "warnings" ? "CAUTION" : "NOMINAL"}</b></div><div className="mock-title"><span>{copy.eyebrow}</span><h3>{copy.title}</h3></div>
    {view === "workout" && <><div className="mission-gauge"><span>03</span><strong>BENCH / B1</strong><em>165 × 9 @ 8</em></div><div className="mission-checks"><span className="done">Warm-up ✓</span><span className="done">Top set ✓</span><span>Back-off 1 LIVE</span><span>Back-off 2</span></div></>}
    {view === "edit" && <div className="mission-config"><label>REP WINDOW <span>8–10</span></label><input aria-label="Rep target" type="range" min="6" max="12" defaultValue="9" /><label>WORK SETS <span>3</span></label><input aria-label="Set count" type="range" min="1" max="5" defaultValue="3" /><button type="button">Commit configuration</button></div>}
    {view === "templates" && <div className="mission-manifest"><button type="button" className="active"><span>A-01</span><strong>Upper A</strong><em>READY · 56m</em></button><button type="button"><span>A-02</span><strong>Lower A</strong><em>RECOVERY 24h</em></button><button type="button"><span>B-01</span><strong>Full Body</strong><em>READY · 62m</em></button></div>}
    {view === "recommendations" && <div className="mission-brief"><span>COMMAND GUIDANCE</span><strong>Maintain 165 lb</strong><p>Add one rep while keeping RPE at or below 9. Progress load only after both back-offs qualify.</p><dl><div><dt>Evidence</dt><dd>2 sessions</dd></div><div><dt>Confidence</dt><dd>Established</dd></div></dl></div>}
    {view === "warnings" && <div className="mission-alert"><b>01</b><span>SAFETY HOLD</span><h4>Shoulder discomfort reported</h4><p>Bench progression is disarmed. Confirm a pain-free substitute or end this movement.</p><button type="button">Open safe route</button></div>}
    {view !== "edit" && <button type="button" className="mission-action">{view === "workout" ? "Log set" : view === "templates" ? "Launch Upper A" : view === "recommendations" ? "Accept guidance" : "Acknowledge"}</button>}
  </div>;
}

function Editorial({ view }: { view: MockupView }) {
  const copy = viewCopy[view];
  return <div className="editorial-screen"><div className="editorial-mast"><strong>THE TRAINING EDITION</strong><span>Tuesday · No. 042</span></div><div className="mock-title"><span>{copy.eyebrow}</span><h3>{copy.title}</h3></div>
    {view === "workout" && <><div className="editorial-lede"><span>03 / 10</span><h4>Bench holds center stage.</h4><p>Back-off one begins at 165 pounds. The target is nine controlled reps at RPE 8.</p></div><div className="editorial-numbers"><b>165<small>LB</small></b><b>9<small>REPS</small></b><b>8<small>RPE</small></b></div></>}
    {view === "edit" && <><div className="editorial-rule"><span>PROGRAM NOTE</span><p>Revise today’s working structure without changing the saved template.</p></div><div className="editorial-form"><label>Repetition range<input defaultValue="8–10" /></label><label>Working sets<input defaultValue="3" /></label><button type="button">Publish today’s edit</button></div></>}
    {view === "templates" && <div className="editorial-index"><span>SELECTED PROGRAM</span><button type="button"><b>01</b><strong>Upper A</strong><em>10 sets · 56 minutes</em></button><button type="button"><b>02</b><strong>Push</strong><em>9 sets · 48 minutes</em></button><button type="button"><b>03</b><strong>Full Body A</strong><em>14 sets · 62 minutes</em></button></div>}
    {view === "recommendations" && <div className="editorial-story"><span>THE COACHING DESK</span><h4>Earn the next plate by owning this one.</h4><p>Keep 165 pounds today and add one rep. Both back-off sets must finish inside the target range before load increases.</p><blockquote>“Progress is available, not mandatory.”</blockquote></div>}
    {view === "warnings" && <div className="editorial-warning"><span>TRAINING NOTICE</span><h4>Shoulder soreness changes the headline.</h4><p>Planned bench progression is paused. Choose a confirmed pain-free press or remove the movement.</p><button type="button">Read safe alternatives</button></div>}
    {view === "workout" && <button type="button" className="editorial-action">Record the set</button>}
  </div>;
}

function BodyAtlas({ view }: { view: MockupView }) {
  const copy = viewCopy[view];
  return <div className="atlas-focus-screen"><div className="mock-title"><span>{copy.eyebrow}</span><h3>{copy.title}</h3></div><div className="atlas-focus-map" aria-label="Front body diagram with chest and shoulder regions highlighted"><svg viewBox="0 0 160 300" role="img"><title>Training body map</title><circle cx="80" cy="28" r="20" /><path d="M49 58 Q80 42 111 58 L126 132 104 166 98 276 80 292 62 276 56 166 34 132Z" /><path className="region chest" d="M56 67 Q80 56 104 67 L101 103 Q80 113 59 103Z" /><path className={`region shoulder ${view === "warnings" ? "flag" : ""}`} d="M49 66 Q37 72 34 94 L53 101 59 73Z" /></svg><div><span>CHEST</span><strong>{view === "warnings" ? "Held" : "9.5 sets"}</strong><small>{view === "warnings" ? "Shoulder flag overlaps press work" : "2 exposures this week"}</small></div></div>
    {view === "workout" && <div className="atlas-sheet"><span>ACTIVE REGION</span><strong>Bench press · B1</strong><div><b>165 lb</b><b>9 reps</b><b>RPE 8</b></div><button type="button">Complete set</button></div>}
    {view === "edit" && <div className="atlas-sheet"><span>REGION DOSE</span><strong>Chest · Today</strong><label>Bench reps<input defaultValue="8–10" /></label><label>Direct sets<input defaultValue="3" /></label><button type="button">Update dose</button></div>}
    {view === "templates" && <div className="atlas-sheet"><span>COVERAGE MAP</span><button type="button" className="atlas-template"><strong>Upper A</strong><small>Chest · back · side delts</small></button><button type="button" className="atlas-template"><strong>Push</strong><small>Chest · delts · triceps</small></button><button type="button">Use Upper A</button></div>}
    {view === "recommendations" && <div className="atlas-sheet"><span>REGIONAL GUIDANCE</span><strong>Chest volume is productive</strong><p>Maintain today’s 165-pound load and add one rep. Weekly exposure remains inside plan.</p><button type="button">View exercise evidence</button></div>}
    {view === "warnings" && <div className="atlas-sheet warning"><span>OVERLAP FLAG</span><strong>Anterior shoulder</strong><p>Discomfort overlaps today’s horizontal press. Progression is paused until a pain-free option is confirmed.</p><button type="button">Find safe substitute</button></div>}
  </div>;
}

function CoachThread({ view }: { view: MockupView }) {
  const copy = viewCopy[view];
  const messages: Record<MockupView, Array<{ who: "coach" | "you" | "system"; text: string }>> = {
    workout: [{ who: "coach", text: "Bench back-off one is ready: 165 lb for 8–10 reps." }, { who: "you", text: "Logged 9 reps at RPE 8." }, { who: "system", text: "Rest started · 2:30. Chest-supported row is next." }],
    edit: [{ who: "coach", text: "What should change for today’s bench work?" }, { who: "you", text: "Use 3 working sets and an 8–10 rep range." }, { who: "system", text: "Preview: top set + 2 back-offs. The saved template is unchanged." }],
    templates: [{ who: "coach", text: "Upper A best matches today’s sequence and available equipment." }, { who: "system", text: "Upper A · 10 sets · about 56 minutes" }, { who: "system", text: "Push · 9 sets · about 48 minutes" }],
    recommendations: [{ who: "coach", text: "Keep bench at 165 pounds and aim for one more rep." }, { who: "system", text: "Why: both recent sessions were productive, but both back-offs have not yet qualified for a load increase." }, { who: "coach", text: "Progress is available only if warm-ups move normally." }],
    warnings: [{ who: "you", text: "My shoulder is sore during pressing." }, { who: "coach", text: "Bench progression is paused. Do not push through pain." }, { who: "system", text: "Choose a confirmed pain-free substitute or remove the exercise." }],
  };
  return <div className="coach-focus-screen"><div className="mock-title"><span>{copy.eyebrow}</span><h3>{copy.title}</h3></div><div className="coach-messages">{messages[view].map((message, index) => <div className={message.who} key={`${message.who}-${index}`}><span>{message.who}</span><p>{message.text}</p>{view === "edit" && index === 1 && <div className="coach-inline-edit"><button type="button">−</button><b>3 sets</b><button type="button">+</button></div>}{view === "templates" && index > 0 && <button type="button">Choose</button>}</div>)}</div><div className="coach-replies"><button type="button">{view === "warnings" ? "Show substitutes" : view === "recommendations" ? "Use guidance" : view === "edit" ? "Apply today only" : "Continue"}</button><button type="button" className="quiet">Explain</button></div></div>;
}

const renderers: Record<DirectionId, (view: MockupView) => ReactNode> = {
  dual: (view) => <DualTrack view={view} />,
  weekline: (view) => <Weekline view={view} />,
  mission: (view) => <Mission view={view} />,
  editorial: (view) => <Editorial view={view} />,
  atlas: (view) => <BodyAtlas view={view} />,
  coach: (view) => <CoachThread view={view} />,
};

export function FocusedMockups() {
  const [view, setView] = useState<MockupView>("workout");
  return <section className="focused-mockups" aria-labelledby="focused-mockups-title">
    <div className="section-heading"><span className="kicker">Six selected directions · 30 screens</span><h2 id="focused-mockups-title">Compare the same task across six different app structures.</h2><p>Switch the task once to update all six phone mockups. Every screen uses the same synthetic workout, so the interaction model—not the content—drives the difference.</p></div>
    <div className="focus-view-tabs" role="tablist" aria-label="Mockup screen">
      {views.map((item) => <button type="button" role="tab" aria-selected={view === item.id} key={item.id} onClick={() => setView(item.id)}>{item.label}</button>)}
    </div>
    <div className="focus-grid">{directions.map((direction) => <Phone direction={direction} view={view} key={direction.id}>{renderers[direction.id](view)}</Phone>)}</div>
  </section>;
}
