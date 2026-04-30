import { jsx, jsxs, Fragment } from "react/jsx-runtime";
const plugin = ({ React, ui, store, sdk, icons }) => {
  const { useState, useEffect, useMemo, useCallback, useRef } = React;
  const { Zap, Heart, RotateCcw, ArrowLeft } = icons;
  const HOLE_COUNT = 6;
  const ROUND_TIME = 60;
  const START_HP = 5;
  const WIN_THRESHOLD = 3;
  const LEVEL_POINTS = [2, 1];
  const H = () => {
    var _a;
    return (_a = sdk.shared.getState()) == null ? void 0 : _a.bqHelpers;
  };
  const backToTree = () => {
    var _a, _b;
    return (_b = (_a = H()) == null ? void 0 : _a.nav) == null ? void 0 : _b.toMap();
  };
  const freshGame = () => ({
    phase: "playing",
    score: 0,
    hp: START_HP,
    combo: 0,
    maxCombo: 0,
    timeLeft: ROUND_TIME,
    correct: 0,
    wrong: 0,
    holeTermIds: []
  });
  const useGame = sdk.create(() => ({
    phase: "menu",
    score: 0,
    hp: START_HP,
    combo: 0,
    maxCombo: 0,
    timeLeft: ROUND_TIME,
    correct: 0,
    wrong: 0,
    holeTermIds: []
  }));
  const colors = {
    hole: "var(--color-base-200)",
    holeRim: "var(--color-base-300)",
    pop: "var(--color-primary)",
    popCorrect: "var(--color-success)",
    popWrong: "var(--color-error)"
  };
  const useBq = () => sdk.shared((s) => s == null ? void 0 : s.bq);
  function Arena() {
    const bq = useBq();
    const treeId = (bq == null ? void 0 : bq.treeId) || "";
    const postId = (bq == null ? void 0 : bq.postId) || "";
    const isChallenge = !!(bq == null ? void 0 : bq.challenge);
    const lexicon = store.useChildren(treeId, "lexicon");
    store.usePost(postId);
    const { phase } = useGame();
    const { nidMap, quizMap } = H().useLexMaps();
    const nodeId = (bq == null ? void 0 : bq.nodeId) || "";
    const gameLexicon = useMemo(() => {
      if (!isChallenge || !nodeId || lexicon.length < 4) return lexicon;
      const filtered = lexicon.filter((l) => (nidMap.get(l.id) || []).includes(nodeId));
      return filtered.length >= 4 ? filtered : lexicon;
    }, [lexicon, nodeId, isChallenge, nidMap]);
    if (!treeId) return /* @__PURE__ */ jsx(ui.Placeholder, { text: "Otwórz BrainQuest i wybierz drzewo wiedzy" });
    if (gameLexicon.length < 4) return /* @__PURE__ */ jsx(ui.Page, { children: /* @__PURE__ */ jsxs(ui.Stack, { children: [
      /* @__PURE__ */ jsx(ui.Placeholder, { text: "Za mało terminów — załaduj drzewo w BrainQuest" }),
      /* @__PURE__ */ jsxs(ui.Button, { outline: true, onClick: backToTree, children: [
        /* @__PURE__ */ jsx(ArrowLeft, { size: 16 }),
        " Wróć do drzewa"
      ] })
    ] }) });
    useEffect(() => {
      if (isChallenge && phase === "menu") useGame.setState(freshGame());
    }, [isChallenge, phase]);
    if (phase === "menu") return /* @__PURE__ */ jsx(MenuScreen, { lexicon: gameLexicon });
    if (phase === "playing") return /* @__PURE__ */ jsx(GameScreen, { lexicon: gameLexicon, quizMap });
    return /* @__PURE__ */ jsx(SummaryScreen, {});
  }
  function MenuScreen({ lexicon }) {
    return /* @__PURE__ */ jsx(ui.Page, { children: /* @__PURE__ */ jsx(ui.Stage, { children: /* @__PURE__ */ jsx(
      ui.StageLayout,
      {
        top: /* @__PURE__ */ jsxs(ui.Stack, { gap: "md", children: [
          /* @__PURE__ */ jsx(ui.StepHeading, { title: "Whack-a-Term!", subtitle: "Trening wolny" }),
          /* @__PURE__ */ jsxs(ui.Stats, { children: [
            /* @__PURE__ */ jsx(ui.Stat, { title: "Terminy", value: String(lexicon.length) }),
            /* @__PURE__ */ jsx(ui.Stat, { title: "Czas", value: `${ROUND_TIME}s` }),
            /* @__PURE__ */ jsx(ui.Stat, { title: "Życia", value: String(START_HP) })
          ] })
        ] }),
        bottom: /* @__PURE__ */ jsx(ui.Button, { size: "lg", color: "primary", block: true, onClick: () => useGame.setState(freshGame()), children: "Start!" })
      }
    ) }) });
  }
  function GameScreen({ lexicon, quizMap }) {
    const { score, hp, combo, timeLeft } = useGame();
    const bq = useBq();
    const isChallenge = !!(bq == null ? void 0 : bq.challenge);
    const [holes, setHoles] = useState(() => Array(HOLE_COUNT).fill(null));
    const [question, setQuestion] = useState(null);
    const [shakeHole, setShakeHole] = useState(null);
    const gameActive = useRef(true);
    const timerRef = useRef(null);
    const usedRecently = useRef(/* @__PURE__ */ new Set());
    const pickRandom = useCallback(() => {
      const pool = lexicon.filter((l) => !usedRecently.current.has(l.id));
      const source = pool.length >= 4 ? pool : lexicon;
      return source[Math.floor(Math.random() * source.length)];
    }, [lexicon]);
    const endGame = useCallback((reason) => {
      var _a;
      gameActive.current = false;
      clearInterval(timerRef.current);
      const state = useGame.getState();
      if (isChallenge && state.correct >= WIN_THRESHOLD && (bq == null ? void 0 : bq.postId)) {
        (_a = H()) == null ? void 0 : _a.unlockNode(bq.postId);
        sdk.log(`Węzeł odblokowany! (${state.correct} trafień)`, "ok");
      }
      useGame.setState({ phase: "summary", ...reason === "time" ? { timeLeft: 0 } : { hp: 0 } });
    }, [isChallenge, bq]);
    const nextQuestion = useCallback(() => {
      if (!gameActive.current) return;
      const correct = pickRandom();
      usedRecently.current.add(correct.id);
      if (usedRecently.current.size > Math.floor(lexicon.length * 0.6)) usedRecently.current.clear();
      const distractors = [...lexicon.filter((l) => l.id !== correct.id)].sort(() => Math.random() - 0.5).slice(0, HOLE_COUNT - 1);
      const allTerms = [correct, ...distractors].sort(() => Math.random() - 0.5);
      const def = String(correct.data.definition);
      const quizRec = quizMap.get(correct.id);
      const quizQuestion = quizRec ? String(quizRec.data.question || "") : "";
      const quizHint = quizRec ? String(quizRec.data.hint || "") : "";
      const texts = [];
      if (quizQuestion) texts.push(quizQuestion);
      if (quizHint) texts.push(quizHint);
      if (texts.length === 0) texts.push(def);
      setQuestion({ termId: correct.id, texts, level: 0 });
      useGame.setState({ holeTermIds: allTerms.map((t) => t.id) });
      setHoles(Array(HOLE_COUNT).fill(null));
      const indices = Array.from({ length: HOLE_COUNT }, (_, i) => i).sort(() => Math.random() - 0.5);
      allTerms.forEach((t, i) => {
        if (i >= HOLE_COUNT) return;
        setTimeout(() => {
          if (!gameActive.current) return;
          setHoles((prev) => {
            const next = [...prev];
            next[indices[i]] = { termId: t.id, term: String(t.data.term), visible: true, hit: false, wrong: false };
            return next;
          });
        }, 200 + Math.random() * 800);
      });
    }, [lexicon, pickRandom, quizMap]);
    const whack = useCallback((idx) => {
      var _a;
      const hole = holes[idx];
      if (!hole || !hole.visible || hole.hit || hole.wrong || !question) return;
      if (hole.termId === question.termId) {
        setHoles((prev) => {
          const n = [...prev];
          n[idx] = { ...hole, hit: true };
          return n;
        });
        const newCombo = useGame.getState().combo + 1;
        const levelPts = LEVEL_POINTS[question.level] || 1;
        useGame.setState((s) => ({
          score: s.score + levelPts * (1 + Math.floor(newCombo / 3)),
          combo: newCombo,
          maxCombo: Math.max(s.maxCombo, newCombo),
          correct: s.correct + 1
        }));
        (_a = H()) == null ? void 0 : _a.discover(hole.termId);
        setTimeout(() => {
          if (gameActive.current) nextQuestion();
        }, 600);
      } else {
        setHoles((prev) => {
          const n = [...prev];
          n[idx] = { ...hole, wrong: true };
          return n;
        });
        setShakeHole(idx);
        setTimeout(() => setShakeHole(null), 400);
        const newHp = useGame.getState().hp - 1;
        if (newHp <= 0) {
          useGame.setState({ hp: 0, combo: 0, wrong: useGame.getState().wrong + 1 });
          endGame("dead");
        } else {
          useGame.setState((s) => ({ hp: newHp, combo: 0, wrong: s.wrong + 1 }));
        }
      }
    }, [holes, question, nextQuestion, endGame]);
    useEffect(() => {
      gameActive.current = true;
      nextQuestion();
      timerRef.current = setInterval(() => {
        const t = useGame.getState().timeLeft;
        if (t <= 1) {
          endGame("time");
          return;
        }
        useGame.setState({ timeLeft: t - 1 });
      }, 1e3);
      return () => {
        gameActive.current = false;
        clearInterval(timerRef.current);
      };
    }, []);
    const progress = isChallenge ? Math.min(useGame.getState().correct / WIN_THRESHOLD, 1) : null;
    const holeStyle = (hole, i) => ({
      aspectRatio: "7/5",
      background: !(hole == null ? void 0 : hole.visible) ? colors.hole : hole.hit ? colors.popCorrect : hole.wrong ? colors.popWrong : colors.pop,
      borderRadius: "16px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: (hole == null ? void 0 : hole.visible) && !hole.hit && !hole.wrong ? "pointer" : "default",
      border: `3px solid ${!(hole == null ? void 0 : hole.visible) ? colors.holeRim : hole.hit ? "var(--color-success)" : hole.wrong ? "var(--color-error)" : "var(--color-primary)"}`,
      transition: "all 0.15s ease",
      transform: shakeHole === i ? "translateX(4px)" : (hole == null ? void 0 : hole.visible) ? "scale(1.05)" : "scale(0.95)",
      opacity: (hole == null ? void 0 : hole.visible) ? 1 : 0.4,
      padding: "8px",
      textAlign: "center",
      userSelect: "none"
    });
    return /* @__PURE__ */ jsx(ui.Page, { children: /* @__PURE__ */ jsx(ui.Stage, { children: /* @__PURE__ */ jsx(
      ui.StageLayout,
      {
        top: /* @__PURE__ */ jsxs(ui.Stack, { gap: "md", children: [
          /* @__PURE__ */ jsxs(ui.Row, { justify: "between", children: [
            /* @__PURE__ */ jsxs(ui.Row, { gap: "sm", children: [
              /* @__PURE__ */ jsxs(ui.Badge, { color: "warning", children: [
                score,
                " pkt"
              ] }),
              combo > 1 && /* @__PURE__ */ jsxs(ui.Badge, { color: "accent", children: [
                "x",
                combo,
                "!"
              ] })
            ] }),
            /* @__PURE__ */ jsxs(ui.Badge, { color: timeLeft <= 10 ? "error" : "info", children: [
              timeLeft,
              "s"
            ] }),
            /* @__PURE__ */ jsx(ui.Row, { gap: "sm", children: Array.from({ length: START_HP }, (_, i) => /* @__PURE__ */ jsx(ui.Badge, { color: i < hp ? "error" : "ghost", children: /* @__PURE__ */ jsx(Heart, { size: 12 }) }, i)) })
          ] }),
          progress !== null && /* @__PURE__ */ jsx(ui.ProgressBar, { value: progress * 100, max: 100, color: progress >= 1 ? "success" : "warning" }),
          /* @__PURE__ */ jsx(ui.Card, { children: /* @__PURE__ */ jsxs(ui.Stack, { children: [
            /* @__PURE__ */ jsxs(ui.Row, { justify: "between", children: [
              /* @__PURE__ */ jsxs(ui.Row, { gap: "sm", children: [
                /* @__PURE__ */ jsx(ui.Text, { size: "xs", muted: true, children: "Znajdź termin:" }),
                question && /* @__PURE__ */ jsxs(ui.Badge, { color: question.level === 0 ? "accent" : "warning", children: [
                  "+",
                  LEVEL_POINTS[question.level] || 1,
                  " pkt"
                ] })
              ] }),
              question && question.level < question.texts.length - 1 && /* @__PURE__ */ jsx(ui.Button, { size: "xs", color: "ghost", onClick: () => setQuestion((q) => q ? { ...q, level: q.level + 1 } : q), children: "💡 Łatwiejsze" })
            ] }),
            /* @__PURE__ */ jsx(ui.Heading, { title: question ? question.texts[question.level] : "..." })
          ] }) }),
          /* @__PURE__ */ jsx(ui.Grid, { cols: 3, gap: "sm", children: Array.from({ length: HOLE_COUNT }, (_, idx) => {
            const hole = holes[idx];
            return /* @__PURE__ */ jsx("div", { style: holeStyle(hole, idx), onClick: () => whack(idx), children: (hole == null ? void 0 : hole.visible) ? /* @__PURE__ */ jsx(ui.Text, { size: "xs", bold: true, children: hole.term }) : /* @__PURE__ */ jsx(ui.Text, { muted: true, children: "?" }) }, idx);
          }) })
        ] })
      }
    ) }) });
  }
  function SummaryScreen() {
    const { score, correct, wrong, maxCombo, hp } = useGame();
    const bq = useBq();
    const isChallenge = !!(bq == null ? void 0 : bq.challenge);
    const won = correct >= WIN_THRESHOLD;
    const node = store.usePost((bq == null ? void 0 : bq.postId) || "");
    const nodeTitle = node ? String(node.data.title) : "";
    return /* @__PURE__ */ jsx(ui.Page, { children: /* @__PURE__ */ jsx(ui.Stage, { children: /* @__PURE__ */ jsx(
      ui.StageLayout,
      {
        top: /* @__PURE__ */ jsxs(ui.Stack, { gap: "md", children: [
          /* @__PURE__ */ jsx(
            ui.StepHeading,
            {
              title: isChallenge ? won ? "Odblokowano!" : "Spróbuj ponownie" : hp <= 0 ? "Koniec żyć!" : "Czas minął!",
              subtitle: isChallenge ? won ? `„${nodeTitle}" odblokowany!` : `Potrzeba ${WIN_THRESHOLD} trafień` : "Podsumowanie"
            }
          ),
          /* @__PURE__ */ jsxs(ui.Stats, { children: [
            /* @__PURE__ */ jsx(ui.Stat, { title: "Wynik", value: String(score) }),
            /* @__PURE__ */ jsx(ui.Stat, { title: "Trafione", value: String(correct), color: "success" }),
            /* @__PURE__ */ jsx(ui.Stat, { title: "Pudła", value: String(wrong), color: "error" }),
            /* @__PURE__ */ jsx(ui.Stat, { title: "Max combo", value: String(maxCombo) })
          ] }),
          /* @__PURE__ */ jsx(ui.Card, { children: /* @__PURE__ */ jsxs(ui.Stack, { children: [
            /* @__PURE__ */ jsxs(ui.Row, { justify: "between", children: [
              /* @__PURE__ */ jsx(ui.Text, { children: "Celność" }),
              /* @__PURE__ */ jsxs(ui.Text, { bold: true, children: [
                correct + wrong > 0 ? Math.round(correct / (correct + wrong) * 100) : 0,
                "%"
              ] })
            ] }),
            isChallenge && /* @__PURE__ */ jsxs(ui.Row, { justify: "between", children: [
              /* @__PURE__ */ jsx(ui.Text, { children: "Próg" }),
              /* @__PURE__ */ jsxs(ui.Badge, { color: won ? "success" : "error", children: [
                correct,
                "/",
                WIN_THRESHOLD
              ] })
            ] })
          ] }) })
        ] }),
        bottom: /* @__PURE__ */ jsx(ui.Stack, { children: isChallenge ? /* @__PURE__ */ jsxs(Fragment, { children: [
          !won && /* @__PURE__ */ jsxs(ui.Button, { size: "lg", color: "primary", block: true, onClick: () => useGame.setState(freshGame()), children: [
            /* @__PURE__ */ jsx(RotateCcw, { size: 16 }),
            " Ponów"
          ] }),
          /* @__PURE__ */ jsxs(ui.Button, { size: "lg", color: won ? "primary" : void 0, outline: !won, block: true, onClick: () => {
            useGame.setState({ phase: "menu" });
            backToTree();
          }, children: [
            /* @__PURE__ */ jsx(ArrowLeft, { size: 16 }),
            " Drzewo"
          ] })
        ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsxs(ui.Button, { size: "lg", color: "primary", block: true, onClick: () => useGame.setState(freshGame()), children: [
            /* @__PURE__ */ jsx(RotateCcw, { size: 16 }),
            " Jeszcze raz!"
          ] }),
          /* @__PURE__ */ jsx(ui.Button, { size: "lg", outline: true, block: true, onClick: () => useGame.setState({ phase: "menu" }), children: "Menu" })
        ] }) })
      }
    ) }) });
  }
  function CheatSheet() {
    var _a, _b;
    const { phase, holeTermIds } = useGame();
    if (phase !== "playing") return null;
    const Shared = (_b = (_a = sdk.shared.getState()) == null ? void 0 : _a.bqHelpers) == null ? void 0 : _b.CheatSheet;
    if (!Shared) return null;
    const holeSet = new Set(holeTermIds || []);
    return /* @__PURE__ */ jsx(
      Shared,
      {
        filter: (id) => holeSet.has(id),
        onBack: backToTree,
        backIcon: ArrowLeft
      }
    );
  }
  const SharedProgress = () => {
    var _a, _b;
    const P = (_b = (_a = sdk.shared.getState()) == null ? void 0 : _a.bqHelpers) == null ? void 0 : _b.Progress;
    return P ? /* @__PURE__ */ jsx(P, {}) : null;
  };
  sdk.registerView("bqa.left", { slot: "left", component: CheatSheet });
  sdk.registerView("bqa.center", { slot: "center", component: Arena });
  sdk.registerView("bqa.right", { slot: "right", component: SharedProgress });
  return { id: "plugin-brain-quest-arena", label: "BQ Arena", icon: Zap, version: "0.5.0" };
};
export {
  plugin as default
};
