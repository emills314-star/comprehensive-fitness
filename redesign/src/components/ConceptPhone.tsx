import { screenFamilies } from "../contract";
import { syntheticFixture } from "../fixtures";
import type { CSSProperties, JSX } from "react";
import type { Concept, ScreenFamilyId } from "../types";

interface ConceptPhoneProps {
  concept: Concept;
  screen: ScreenFamilyId;
}

const familyCopy: Record<ScreenFamilyId, { eyebrow: string; title: string; action: string }> = {
  home: { eyebrow: "Next action", title: "Upper A is ready", action: "Review readiness" },
  readiness: { eyebrow: "Today only", title: "Inside your normal range", action: "Start as planned" },
  workout: { eyebrow: "Set 3 of 10", title: "Bench · Back-off 1", action: "Complete set" },
  safety: { eyebrow: "Evidence & safety", title: "Hold load until all back-offs qualify", action: "Review evidence" },
  summary: { eyebrow: "Explicit submission", title: "Upper A complete", action: "Confirm submission" },
  plan: { eyebrow: "Week 4 of 6", title: "Four-day progression block", action: "Check viability" },
  progress: { eyebrow: "Six-week trend", title: "Bench e1RM +7.2%", action: "Inspect lift" },
  data: { eyebrow: "Local-first", title: "Your data stays on this device", action: "Export backup" },
};

function ContextCopy({ screen }: { screen: ScreenFamilyId }) {
  const copy = familyCopy[screen];
  return (
    <>
      <span className="phone-eyebrow">{copy.eyebrow}</span>
      <h4>{copy.title}</h4>
      <p>{screenFamilies.find((family) => family.id === screen)?.purpose}</p>
    </>
  );
}

function SetStack({ screen }: { screen: ScreenFamilyId }) {
  return (
    <div className="set-stack-scene">
      <div className="set-stack-rail" aria-hidden="true"><i /><i className="active" /><i /><i /></div>
      <div className="set-stack-card ghost second" />
      <div className="set-stack-card ghost first" />
      <article className="set-stack-card current">
        <ContextCopy screen={screen} />
        <div className="set-stack-number">{screen === "workout" ? "165 × 9" : screen === "readiness" ? "78" : "03"}</div>
        <button type="button">{familyCopy[screen].action}</button>
      </article>
    </div>
  );
}

function IronLedger({ screen }: { screen: ScreenFamilyId }) {
  return (
    <div className="ledger-scene">
      <div className="ledger-date">{syntheticFixture.date.toUpperCase()}</div>
      <ContextCopy screen={screen} />
      {["Barbell Bench Press", "Chest-Supported Row", "Cable Lateral Raise"].map((item, index) => (
        <div className="ledger-row" key={item}>
          <span>0{index + 1}</span><strong>{item}</strong><em>{index === 0 ? "LIVE" : "UP NEXT"}</em>
        </div>
      ))}
      <button className="ledger-stamp" type="button">{familyCopy[screen].action}</button>
    </div>
  );
}

function BodyAtlas({ screen }: { screen: ScreenFamilyId }) {
  return (
    <div className="atlas-scene">
      <ContextCopy screen={screen} />
      <svg className="body-map" viewBox="0 0 180 250" role="img" aria-label="Schematic body map with chest and shoulders selected">
        <circle cx="90" cy="28" r="20" />
        <path d="M65 55 Q90 42 115 55 L130 125 112 146 108 225 91 225 90 157 89 225 72 225 68 146 50 125Z" />
        <path className="active-muscle" d="M69 68 Q90 57 111 68 L105 100 Q90 108 75 100Z" />
        <path className="active-muscle secondary" d="M55 61 Q66 52 75 64 L68 93 53 82Z M125 61 Q114 52 105 64 L112 93 127 82Z" />
      </svg>
      <div className="atlas-region"><strong>Chest</strong><span>9.5 effective sets · 2 exposures</span></div>
      <button type="button">{familyCopy[screen].action}</button>
    </div>
  );
}

function Weekline({ screen }: { screen: ScreenFamilyId }) {
  return (
    <div className="weekline-scene">
      <ContextCopy screen={screen} />
      <div className="weekline-axis">
        {syntheticFixture.week.slice(0, 5).map((day, index) => (
          <div className={`weekline-event ${day.state}`} key={`${day.day}-${index}`}>
            <span>{day.day}</span><i /><div><strong>{day.label}</strong><small>{day.state === "today" ? "56 min · now" : day.state}</small></div>
          </div>
        ))}
      </div>
      <button type="button">{familyCopy[screen].action}</button>
    </div>
  );
}

function CoachThread({ screen }: { screen: ScreenFamilyId }) {
  return (
    <div className="thread-scene">
      <ContextCopy screen={screen} />
      <div className="thread-message coach"><span>Coach</span><p>{syntheticFixture.readiness.guidance}</p></div>
      <div className="thread-message user"><span>You</span><p>Warm-ups feel normal.</p></div>
      <div className="thread-action"><strong>{screen === "workout" ? "Log the next back-off" : "Upper A"}</strong><small>Targets remain inside the saved prescription.</small><button type="button">{familyCopy[screen].action}</button></div>
    </div>
  );
}

function MissionConsole({ screen }: { screen: ScreenFamilyId }) {
  return (
    <div className="console-scene">
      <div className="console-header"><span>CF / MISSION 04</span><b>LIVE</b></div>
      <ContextCopy screen={screen} />
      <div className="console-grid">
        <div><span>READINESS</span><strong>78</strong></div>
        <div><span>SETS</span><strong>2 / 10</strong></div>
        <div><span>REST</span><strong>02:30</strong></div>
        <div><span>LOAD</span><strong>165 LB</strong></div>
      </div>
      <div className="console-stages"><i className="done" /><i className="live" /><i /><i /></div>
      <button type="button">{familyCopy[screen].action}</button>
    </div>
  );
}

function StadiumLive({ screen }: { screen: ScreenFamilyId }) {
  return (
    <div className="stadium-scene">
      <div className="stadium-ticker">LIVE · UPPER A · WEEK 4 · {screen.toUpperCase()}</div>
      <ContextCopy screen={screen} />
      <div className="stadium-score"><span>SET</span><strong>{screen === "workout" ? "03" : "78"}</strong><em>{screen === "workout" ? "165 LB · 9 REPS" : "READY"}</em></div>
      <div className="stadium-lineup"><span>BENCH</span><span>ROW</span><span>RAISE</span></div>
      <button type="button">{familyCopy[screen].action}</button>
    </div>
  );
}

function QuestMap({ screen }: { screen: ScreenFamilyId }) {
  return (
    <div className="quest-scene">
      <ContextCopy screen={screen} />
      <svg className="quest-path" viewBox="0 0 260 360" role="img" aria-label="Vertical training route with completed, current, and upcoming stages">
        <path d="M35 320 C70 280 180 300 190 240 S70 180 100 125 220 85 210 30" />
        <circle cx="35" cy="320" r="13" className="done" /><circle cx="190" cy="240" r="18" className="current" /><circle cx="100" cy="125" r="13" /><circle cx="210" cy="30" r="13" />
      </svg>
      <div className="quest-banner"><span>STAGE 4</span><strong>{screen === "plan" ? "Build the route" : "Upper A ridge"}</strong></div>
      <button type="button">{familyCopy[screen].action}</button>
    </div>
  );
}

function TrainingWorkshop({ screen }: { screen: ScreenFamilyId }) {
  return (
    <div className="workshop-scene">
      <div className="workshop-label">WORK ORDER 04–A</div>
      <ContextCopy screen={screen} />
      <div className="tool-tray">
        <div className="tool active"><i /><strong>Bench</strong><small>165 × 9</small></div>
        <div className="tool"><i /><strong>Row</strong><small>3 sets</small></div>
        <div className="tool"><i /><strong>Raise</strong><small>3 sets</small></div>
      </div>
      <div className="workbench-control"><span>LOAD</span><button type="button">−</button><strong>165</strong><button type="button">+</button></div>
      <button type="button">{familyCopy[screen].action}</button>
    </div>
  );
}

function BentoStudio({ screen }: { screen: ScreenFamilyId }) {
  return (
    <div className="bento-scene">
      <div className="bento-cell hero"><ContextCopy screen={screen} /><button type="button">{familyCopy[screen].action}</button></div>
      <div className="bento-cell score"><span>READINESS</span><strong>78</strong></div>
      <div className="bento-cell timer"><span>REST</span><strong>2:30</strong></div>
      <div className="bento-cell sets"><span>SESSION</span><strong>2 / 10 sets</strong><i><b style={{ width: "20%" }} /></i></div>
      <div className="bento-cell insight"><span>COACHING</span><p>Hold load until every back-off set reaches its range.</p></div>
    </div>
  );
}

function Orbit({ screen }: { screen: ScreenFamilyId }) {
  return (
    <div className="orbit-scene">
      <ContextCopy screen={screen} />
      <div className="orbit-system" aria-label="Current action surrounded by readiness, plan, progress, and data destinations">
        <div className="orbit-ring outer" /><div className="orbit-ring inner" />
        <button className="satellite readiness" type="button">78</button>
        <button className="satellite plan" type="button">PLAN</button>
        <button className="satellite progress" type="button">+7%</button>
        <button className="satellite data" type="button">DATA</button>
        <button className="orbit-core" type="button"><span>NOW</span><strong>{screen === "workout" ? "165 × 9" : "Upper A"}</strong></button>
      </div>
    </div>
  );
}

function EditorialPerformance({ screen }: { screen: ScreenFamilyId }) {
  return (
    <div className="editorial-scene">
      <div className="issue-line">PERFORMANCE / ISSUE 04</div>
      <ContextCopy screen={screen} />
      <div className="editorial-rule" />
      <div className="editorial-columns">
        <p><strong>Today.</strong> Readiness is steady. The planned session remains the correct target.</p>
        <p><strong>What changes.</strong> Nothing unless warm-ups disagree with the current evidence.</p>
      </div>
      <blockquote>“Own the back-off range before adding load.”</blockquote>
      <button type="button">{familyCopy[screen].action}</button>
    </div>
  );
}

function CommandGym({ screen }: { screen: ScreenFamilyId }) {
  return (
    <div className="command-scene">
      <div className="command-status">CF:READY / LOCAL / {screen.toUpperCase()}</div>
      <ContextCopy screen={screen} />
      <div className="command-prompt"><span>&gt;</span><strong>{screen === "workout" ? "log bench 165 9 8" : "open upper-a"}</strong><i>_</i></div>
      <div className="command-results">
        <button type="button">[1] {familyCopy[screen].action}</button>
        <button type="button">[2] explain target</button>
        <button type="button">[3] resume session</button>
      </div>
      <small>↑↓ choose · enter execute · esc cancel</small>
    </div>
  );
}

function ProgramCircuit({ screen }: { screen: ScreenFamilyId }) {
  return (
    <div className="circuit-scene">
      <ContextCopy screen={screen} />
      <svg className="circuit-map" viewBox="0 0 300 360" role="img" aria-label="Program nodes connected from readiness through exercises to progress">
        <path d="M150 35 V85 H65 V145 M150 85 H235 V145 M65 195 V250 H150 M235 195 V250 H150 V315" />
        <g><rect x="102" y="15" width="96" height="42" rx="8" /><text x="150" y="41">READINESS 78</text></g>
        <g><rect x="20" y="145" width="90" height="50" rx="8" className="active" /><text x="65" y="175">BENCH</text></g>
        <g><rect x="190" y="145" width="90" height="50" rx="8" /><text x="235" y="175">ROW</text></g>
        <g><rect x="100" y="250" width="100" height="42" rx="8" /><text x="150" y="276">VOLUME</text></g>
        <g><rect x="100" y="315" width="100" height="34" rx="8" /><text x="150" y="337">PROGRESS</text></g>
      </svg>
      <button type="button">{familyCopy[screen].action}</button>
    </div>
  );
}

function DualTrack({ screen }: { screen: ScreenFamilyId }) {
  return (
    <div className="track-scene">
      <div className="track-topline"><span>UPPER A</span><b>{screen.toUpperCase()}</b><em>18:42</em></div>
      <ContextCopy screen={screen} />
      <div className="track-grid">
        {syntheticFixture.session.exercises.map((exercise, exerciseIndex) => (
          <div className={`track-lane ${exerciseIndex === 0 ? "armed" : ""}`} key={exercise.id}>
            <strong>{exercise.name.split(" ")[0]}</strong>
            <div>{exercise.sets.slice(0, 4).map((set, index) => <i key={set.id} className={set.complete ? "done" : index === 2 && exerciseIndex === 0 ? "play" : ""}>{index + 1}</i>)}</div>
          </div>
        ))}
        <span className="track-playhead" />
      </div>
      <div className="track-dock"><span>CURRENT</span><strong>{screen === "workout" ? "165 × 9 @ 8" : familyCopy[screen].title}</strong><button type="button">{familyCopy[screen].action}</button></div>
    </div>
  );
}

const renderers: Record<string, (screen: ScreenFamilyId) => JSX.Element> = {
  stack: (screen) => <SetStack screen={screen} />,
  ledger: (screen) => <IronLedger screen={screen} />,
  atlas: (screen) => <BodyAtlas screen={screen} />,
  timeline: (screen) => <Weekline screen={screen} />,
  thread: (screen) => <CoachThread screen={screen} />,
  console: (screen) => <MissionConsole screen={screen} />,
  scoreboard: (screen) => <StadiumLive screen={screen} />,
  quest: (screen) => <QuestMap screen={screen} />,
  workshop: (screen) => <TrainingWorkshop screen={screen} />,
  bento: (screen) => <BentoStudio screen={screen} />,
  orbit: (screen) => <Orbit screen={screen} />,
  editorial: (screen) => <EditorialPerformance screen={screen} />,
  command: (screen) => <CommandGym screen={screen} />,
  circuit: (screen) => <ProgramCircuit screen={screen} />,
  tracks: (screen) => <DualTrack screen={screen} />,
};

export function ConceptPhone({ concept, screen }: ConceptPhoneProps) {
  return (
    <div
      className={`concept-phone concept-phone-${concept.layout}`}
      style={{
        "--concept-canvas": concept.theme.canvas,
        "--concept-surface": concept.theme.surface,
        "--concept-ink": concept.theme.ink,
        "--concept-muted": concept.theme.muted,
        "--concept-accent": concept.theme.accent,
        "--concept-font": concept.font,
      } as CSSProperties}
      aria-label={`${concept.name}: ${screenFamilies.find((item) => item.id === screen)?.label}`}
    >
      <div className="phone-status"><span>9:41</span><span>● ◔ ▰</span></div>
      <div className="phone-content">{renderers[concept.layout](screen)}</div>
      <div className="phone-home-indicator" />
    </div>
  );
}
