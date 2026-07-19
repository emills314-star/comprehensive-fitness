import { useEffect, useMemo, useState } from "react";
import { syntheticFixture } from "../fixtures";

type Mode = "today" | "plan" | "progress" | "data";

export function DualTrackPrototype() {
  const [mode, setMode] = useState<Mode>("today");
  const initialSets = useMemo(
    () => syntheticFixture.session.exercises.flatMap((exercise) => exercise.sets.map((set) => ({ ...set, exerciseId: exercise.id }))),
    [],
  );
  const [sets, setSets] = useState(initialSets);
  const [currentSetId, setCurrentSetId] = useState("bench-back-1");
  const [restSeconds, setRestSeconds] = useState(0);
  const [consent, setConsent] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const currentSet = sets.find((set) => set.id === currentSetId) ?? sets.find((set) => !set.complete) ?? sets[0];
  const completed = sets.filter((set) => set.complete).length;

  useEffect(() => {
    if (restSeconds <= 0) return;
    const timer = window.setInterval(() => setRestSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [restSeconds]);

  function completeCurrentSet() {
    setSets((current) => current.map((set) => set.id === currentSet.id ? { ...set, complete: true } : set));
    const next = sets.find((set) => !set.complete && set.id !== currentSet.id);
    if (next) setCurrentSetId(next.id);
    setRestSeconds(150);
  }

  return (
    <section className="winner-prototype" aria-labelledby="winner-prototype-title">
      <div className="prototype-intro">
        <span className="kicker">Recommended direction · Rank 1</span>
        <h2 id="winner-prototype-title">Dual Track interactive journey</h2>
        <p>The prototype uses only synthetic data. It demonstrates the interaction structure, not production persistence or recommendation logic.</p>
      </div>
      <div className="prototype-shell">
        <nav className="prototype-mode-rail" aria-label="Prototype modes">
          {(["today", "plan", "progress", "data"] as Mode[]).map((item) => (
            <button type="button" key={item} aria-pressed={mode === item} onClick={() => setMode(item)}>{item}</button>
          ))}
        </nav>

        {mode === "today" && (
          <div className="prototype-today">
            <header className="prototype-header"><div><span>LIVE SESSION</span><h3>{syntheticFixture.session.name}</h3></div><strong>{completed} / {sets.length}</strong></header>
            <div className="prototype-track-area">
              {syntheticFixture.session.exercises.map((exercise) => (
                <div className="prototype-lane" key={exercise.id}>
                  <button type="button" onClick={() => setCurrentSetId(exercise.sets.find((set) => !sets.find((item) => item.id === set.id)?.complete)?.id ?? exercise.sets[0].id)}>
                    <strong>{exercise.name}</strong><small>{exercise.prescription}</small>
                  </button>
                  <div className="prototype-clips">
                    {exercise.sets.map((sourceSet) => {
                      const set = sets.find((item) => item.id === sourceSet.id)!;
                      return <button type="button" key={set.id} className={`${set.complete ? "complete" : ""} ${set.id === currentSet.id ? "current" : ""}`} onClick={() => setCurrentSetId(set.id)} aria-label={`${exercise.name}, ${set.role} set, ${set.complete ? "complete" : "not complete"}`}>{set.role.slice(0, 1)}{sourceSet.id.endsWith("2") ? "2" : sourceSet.id.endsWith("3") ? "3" : ""}</button>;
                    })}
                  </div>
                </div>
              ))}
              <div className="prototype-playhead" aria-hidden="true"><span /></div>
            </div>
            <div className="prototype-control-dock">
              <div><span>CURRENT SET</span><strong>{currentSet.weight} lb × {currentSet.reps} @ {currentSet.rpe}</strong><small>{currentSet.role} · target {currentSet.target}</small></div>
              {restSeconds > 0 ? (
                <div className="prototype-rest" role="timer" aria-live="polite"><span>REST</span><strong>{Math.floor(restSeconds / 60)}:{String(restSeconds % 60).padStart(2, "0")}</strong><button type="button" onClick={() => setRestSeconds(0)}>Skip rest</button></div>
              ) : (
                <button className="prototype-primary" type="button" onClick={completeCurrentSet}>Complete set</button>
              )}
              <button className="prototype-submit" type="button" onClick={() => setSubmitOpen(true)}>Review submission</button>
            </div>
          </div>
        )}

        {mode === "plan" && (
          <div className="prototype-plan">
            <header className="prototype-header"><div><span>ARRANGEMENT</span><h3>Six-week progression block</h3></div><strong>4 DAYS</strong></header>
            {syntheticFixture.week.slice(0, 5).map((day, index) => (
              <div className={`plan-track ${day.state}`} key={`${day.day}-${index}`}><span>{day.day}</span><strong>{day.label}</strong><div><i /><i /><i /></div><em>{day.state}</em></div>
            ))}
            <aside><strong>Viability check</strong><span>0 blocking · 2 reviewed exceptions</span><button type="button">Open arrangement review</button></aside>
          </div>
        )}

        {mode === "progress" && (
          <div className="prototype-progress">
            <header className="prototype-header"><div><span>PERFORMANCE TRACK</span><h3>Barbell Bench Press</h3></div><strong>+7.2%</strong></header>
            <svg viewBox="0 0 600 280" role="img" aria-label="Estimated one-repetition maximum rises from 223 to 239 pounds over six weeks">
              <path className="grid" d="M45 35H575M45 95H575M45 155H575M45 215H575" />
              <polyline points="55,205 155,170 255,180 355,125 455,98 555,55" />
              {syntheticFixture.progress.map((point, index) => <g key={point.week}><circle cx={55 + index * 100} cy={[205,170,180,125,98,55][index]} r="7" /><text x={55 + index * 100} y="250">{point.week}</text></g>)}
            </svg>
            <div className="progress-readout"><span>Current e1RM</span><strong>239 lb</strong><p>Trend is productive. No regression or fatigue flag is active.</p></div>
          </div>
        )}

        {mode === "data" && (
          <div className="prototype-data">
            <header className="prototype-header"><div><span>LOCAL SYSTEM</span><h3>Data and privacy</h3></div><strong>ON DEVICE</strong></header>
            <div className="data-row"><div><strong>Export backup</strong><span>Download the selected local app-data copy.</span></div><button type="button">Export</button></div>
            <label className="data-row"><div><strong>Optional workout cloud copy</strong><span>Separate consent; notifications do not enable uploads.</span></div><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /></label>
            <div className="data-row danger"><div><strong>Clear all local app data</strong><span>Remote cleanup must finish first when cloud consent is active.</span></div><button type="button">Review</button></div>
          </div>
        )}
      </div>

      {submitOpen && (
        <div className="prototype-dialog-backdrop" role="presentation" onMouseDown={() => setSubmitOpen(false)}>
          <div className="prototype-dialog" role="dialog" aria-modal="true" aria-labelledby="submit-title" onMouseDown={(event) => event.stopPropagation()}>
            <span>FINAL ACTION</span><h3 id="submit-title">Submit this workout?</h3><p>Only submitted sessions become canonical history and analytics.</p>
            <div><button type="button" onClick={() => setSubmitOpen(false)}>Keep editing</button><button className="prototype-primary" type="button" onClick={() => setSubmitOpen(false)}>Confirm submission</button></div>
          </div>
        </div>
      )}
    </section>
  );
}
