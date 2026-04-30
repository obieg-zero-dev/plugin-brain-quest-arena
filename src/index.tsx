import type { PluginFactory, PostRecord } from '@obieg-zero/sdk'

const plugin: PluginFactory = ({ React, ui, store, sdk, icons }) => {
  const { useState, useEffect, useMemo, useCallback, useRef } = React
  const { Zap, Heart, RotateCcw, ArrowLeft } = icons

  type Phase = 'menu' | 'playing' | 'summary'
  type Hole = { termId: string; term: string; visible: boolean; hit: boolean; wrong: boolean }

  const HOLE_COUNT = 6
  const ROUND_TIME = 60
  const START_HP = 5
  const WIN_THRESHOLD = 3
  const LEVEL_POINTS = [2, 1] // pełne pytanie, łatwiejsza parafraza

  type LexMaps = { nidMap: Map<string, string[]>; formMap: Map<string, string[]>; quizMap: Map<string, PostRecord> }
  type BqHelpers = {
    discover: (id: string) => void
    unlockNode: (postId: string) => void
    useLexMaps: () => LexMaps
    nav?: { toMap: (extra?: any) => void; toReader: (extra?: any) => void; toArena: (extra?: any) => void }
  }
  const H = (): BqHelpers | undefined => (sdk.shared.getState() as any)?.bqHelpers
  const backToTree = () => H()?.nav?.toMap()

  const freshGame = (): Record<string, any> => ({
    phase: 'playing' as Phase, score: 0, hp: START_HP, combo: 0, maxCombo: 0,
    timeLeft: ROUND_TIME, correct: 0, wrong: 0, holeTermIds: [] as string[],
  })

  const useGame = sdk.create(() => ({
    phase: 'menu' as Phase,
    score: 0, hp: START_HP, combo: 0, maxCombo: 0, timeLeft: ROUND_TIME, correct: 0, wrong: 0,
    holeTermIds: [] as string[],
  }))

  const colors = {
    hole: 'var(--color-base-200)', holeRim: 'var(--color-base-300)', pop: 'var(--color-primary)',
    popCorrect: 'var(--color-success)', popWrong: 'var(--color-error)',
  }

  type BqShared = { treeId?: string; nodeId?: string; postId?: string; challenge?: boolean }
  const useBq = () => sdk.shared(s => (s as any)?.bq) as BqShared | undefined

  // --- Arena ---
  function Arena() {
    const bq = useBq()
    const treeId = bq?.treeId || ''
    const postId = bq?.postId || ''
    const isChallenge = !!bq?.challenge
    const lexicon = store.useChildren(treeId, 'lexicon') as PostRecord[]
    const node = store.usePost(postId)
    const { phase } = useGame()
    const { nidMap, quizMap } = H()!.useLexMaps()

    const nodeId = bq?.nodeId || ''

    const gameLexicon = useMemo(() => {
      if (!isChallenge || !nodeId || lexicon.length < 4) return lexicon
      const filtered = lexicon.filter(l => (nidMap.get(l.id) || []).includes(nodeId))
      return filtered.length >= 4 ? filtered : lexicon
    }, [lexicon, nodeId, isChallenge, nidMap])

    if (!treeId) return <ui.Placeholder text="Otwórz BrainQuest i wybierz drzewo wiedzy" />
    if (gameLexicon.length < 4) return (
      <ui.Page><ui.Stack>
        <ui.Placeholder text="Za mało terminów — załaduj drzewo w BrainQuest" />
        <ui.Button outline onClick={backToTree}><ArrowLeft size={16} /> Wróć do drzewa</ui.Button>
      </ui.Stack></ui.Page>
    )

    useEffect(() => { if (isChallenge && phase === 'menu') useGame.setState(freshGame()) }, [isChallenge, phase])
    if (phase === 'menu') return <MenuScreen lexicon={gameLexicon} />
    if (phase === 'playing') return <GameScreen lexicon={gameLexicon} quizMap={quizMap} />
    return <SummaryScreen />
  }

  function MenuScreen({ lexicon }: { lexicon: PostRecord[] }) {
    return (
      <ui.Page><ui.Stage><ui.StageLayout
        top={<ui.Stack gap="md">
          <ui.StepHeading title="Whack-a-Term!" subtitle="Trening wolny" />
          <ui.Stats>
            <ui.Stat title="Terminy" value={String(lexicon.length)} />
            <ui.Stat title="Czas" value={`${ROUND_TIME}s`} />
            <ui.Stat title="Życia" value={String(START_HP)} />
          </ui.Stats>
        </ui.Stack>}
        bottom={<ui.Button size="lg" color="primary" block onClick={() => useGame.setState(freshGame())}>Start!</ui.Button>}
      /></ui.Stage></ui.Page>
    )
  }

  // --- Game Screen ---
  function GameScreen({ lexicon, quizMap }: { lexicon: PostRecord[]; quizMap: Map<string, PostRecord> }) {
    const { score, hp, combo, timeLeft } = useGame()
    const bq = useBq()
    const isChallenge = !!bq?.challenge
    const [holes, setHoles] = useState<(Hole | null)[]>(() => Array(HOLE_COUNT).fill(null))
    const [question, setQuestion] = useState<{ termId: string; texts: string[]; level: number } | null>(null)
    const [shakeHole, setShakeHole] = useState<number | null>(null)
    const gameActive = useRef(true)
    const timerRef = useRef<any>(null)
    const usedRecently = useRef<Set<string>>(new Set())

    const pickRandom = useCallback(() => {
      const pool = lexicon.filter(l => !usedRecently.current.has(l.id))
      const source = pool.length >= 4 ? pool : lexicon
      return source[Math.floor(Math.random() * source.length)]
    }, [lexicon])

    const endGame = useCallback((reason: 'time' | 'dead') => {
      gameActive.current = false
      clearInterval(timerRef.current)
      const state = useGame.getState()
      if (isChallenge && state.correct >= WIN_THRESHOLD && bq?.postId) {
        H()?.unlockNode(bq.postId)
        sdk.log(`Węzeł odblokowany! (${state.correct} trafień)`, 'ok')
      }
      useGame.setState({ phase: 'summary' as Phase, ...(reason === 'time' ? { timeLeft: 0 } : { hp: 0 }) })
    }, [isChallenge, bq])

    const nextQuestion = useCallback(() => {
      if (!gameActive.current) return
      const correct = pickRandom()
      usedRecently.current.add(correct.id)
      if (usedRecently.current.size > Math.floor(lexicon.length * 0.6)) usedRecently.current.clear()

      const distractors = [...lexicon.filter(l => l.id !== correct.id)].sort(() => Math.random() - 0.5).slice(0, HOLE_COUNT - 1)
      const allTerms = [correct, ...distractors].sort(() => Math.random() - 0.5)

      const def = String(correct.data.definition)
      const quizRec = quizMap.get(correct.id)
      const quizQuestion = quizRec ? String(quizRec.data.question || '') : ''
      const quizHint = quizRec ? String(quizRec.data.hint || '') : ''

      // Dwa poziomy: pełne pytanie + parafraza. Brak quizu = jeden poziom (definicja).
      const texts: string[] = []
      if (quizQuestion) texts.push(quizQuestion)
      if (quizHint) texts.push(quizHint)
      if (texts.length === 0) texts.push(def)

      setQuestion({ termId: correct.id, texts, level: 0 })
      useGame.setState({ holeTermIds: allTerms.map(t => t.id) })
      setHoles(Array(HOLE_COUNT).fill(null))
      const indices = Array.from({ length: HOLE_COUNT }, (_, i) => i).sort(() => Math.random() - 0.5)
      allTerms.forEach((t, i) => {
        if (i >= HOLE_COUNT) return
        setTimeout(() => {
          if (!gameActive.current) return
          setHoles(prev => {
            const next = [...prev]
            next[indices[i]] = { termId: t.id, term: String(t.data.term), visible: true, hit: false, wrong: false }
            return next
          })
        }, 200 + Math.random() * 800)
      })
    }, [lexicon, pickRandom, quizMap])

    const whack = useCallback((idx: number) => {
      const hole = holes[idx]
      if (!hole || !hole.visible || hole.hit || hole.wrong || !question) return
      if (hole.termId === question.termId) {
        setHoles(prev => { const n = [...prev]; n[idx] = { ...hole, hit: true }; return n })
        const newCombo = useGame.getState().combo + 1
        const levelPts = LEVEL_POINTS[question.level] || 1
        useGame.setState(s => ({
          score: s.score + levelPts * (1 + Math.floor(newCombo / 3)),
          combo: newCombo, maxCombo: Math.max(s.maxCombo, newCombo), correct: s.correct + 1,
        }))
        H()?.discover(hole.termId)
        setTimeout(() => { if (gameActive.current) nextQuestion() }, 600)
      } else {
        setHoles(prev => { const n = [...prev]; n[idx] = { ...hole, wrong: true }; return n })
        setShakeHole(idx)
        setTimeout(() => setShakeHole(null), 400)
        const newHp = useGame.getState().hp - 1
        if (newHp <= 0) {
          useGame.setState({ hp: 0, combo: 0, wrong: useGame.getState().wrong + 1 })
          endGame('dead')
        } else {
          useGame.setState(s => ({ hp: newHp, combo: 0, wrong: s.wrong + 1 }))
        }
      }
    }, [holes, question, nextQuestion, endGame])

    useEffect(() => {
      gameActive.current = true
      nextQuestion()
      timerRef.current = setInterval(() => {
        const t = useGame.getState().timeLeft
        if (t <= 1) { endGame('time'); return }
        useGame.setState({ timeLeft: t - 1 })
      }, 1000)
      return () => { gameActive.current = false; clearInterval(timerRef.current) }
    }, [])

    const progress = isChallenge ? Math.min(useGame.getState().correct / WIN_THRESHOLD, 1) : null

    const holeStyle = (hole: Hole | null, i: number): React.CSSProperties => ({
      aspectRatio: '7/5',
      background: !hole?.visible ? colors.hole : hole.hit ? colors.popCorrect : hole.wrong ? colors.popWrong : colors.pop,
      borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: hole?.visible && !hole.hit && !hole.wrong ? 'pointer' : 'default',
      border: `3px solid ${!hole?.visible ? colors.holeRim : hole.hit ? 'var(--color-success)' : hole.wrong ? 'var(--color-error)' : 'var(--color-primary)'}`,
      transition: 'all 0.15s ease',
      transform: shakeHole === i ? 'translateX(4px)' : hole?.visible ? 'scale(1.05)' : 'scale(0.95)',
      opacity: hole?.visible ? 1 : 0.4,
      padding: '8px', textAlign: 'center' as const, userSelect: 'none' as const,
    })

    return (
      <ui.Page><ui.Stage><ui.StageLayout
        top={<ui.Stack gap="md">
          <ui.Row justify="between">
            <ui.Row gap="sm">
              <ui.Badge color="warning">{score} pkt</ui.Badge>
              {combo > 1 && <ui.Badge color="accent">x{combo}!</ui.Badge>}
            </ui.Row>
            <ui.Badge color={timeLeft <= 10 ? 'error' : 'info'}>{timeLeft}s</ui.Badge>
            <ui.Row gap="sm">
              {Array.from({ length: START_HP }, (_, i) => (
                <ui.Badge key={i} color={i < hp ? 'error' : 'ghost'}><Heart size={12} /></ui.Badge>
              ))}
            </ui.Row>
          </ui.Row>
          {progress !== null && <ui.ProgressBar value={progress * 100} max={100} color={progress >= 1 ? 'success' : 'warning'} />}
          <ui.Card>
            <ui.Stack>
              <ui.Row justify="between">
                <ui.Row gap="sm">
                  <ui.Text size="xs" muted>Znajdź termin:</ui.Text>
                  {question && <ui.Badge color={question.level === 0 ? 'accent' : 'warning'}>
                    +{LEVEL_POINTS[question.level] || 1} pkt
                  </ui.Badge>}
                </ui.Row>
                {question && question.level < question.texts.length - 1 && (
                  <ui.Button size="xs" color="ghost" onClick={() => setQuestion(q => q ? { ...q, level: q.level + 1 } : q)}>💡 Łatwiejsze</ui.Button>
                )}
              </ui.Row>
              <ui.Heading title={question ? question.texts[question.level] : '...'} />
            </ui.Stack>
          </ui.Card>
          <ui.Grid cols={3} gap="sm">
            {Array.from({ length: HOLE_COUNT }, (_, idx) => {
              const hole = holes[idx]
              return (
                <div key={idx} style={holeStyle(hole, idx)} onClick={() => whack(idx)}>
                  {hole?.visible
                    ? <ui.Text size="xs" bold>{hole.term}</ui.Text>
                    : <ui.Text muted>?</ui.Text>}
                </div>
              )
            })}
          </ui.Grid>
        </ui.Stack>}
      /></ui.Stage></ui.Page>
    )
  }

  // --- Summary ---
  function SummaryScreen() {
    const { score, correct, wrong, maxCombo, hp } = useGame()
    const bq = useBq()
    const isChallenge = !!bq?.challenge
    const won = correct >= WIN_THRESHOLD
    const node = store.usePost(bq?.postId || '')
    const nodeTitle = node ? String(node.data.title) : ''

    return (
      <ui.Page><ui.Stage><ui.StageLayout
        top={<ui.Stack gap="md">
          <ui.StepHeading
            title={isChallenge ? (won ? 'Odblokowano!' : 'Spróbuj ponownie') : (hp <= 0 ? 'Koniec żyć!' : 'Czas minął!')}
            subtitle={isChallenge ? (won ? `„${nodeTitle}" odblokowany!` : `Potrzeba ${WIN_THRESHOLD} trafień`) : 'Podsumowanie'}
          />
          <ui.Stats>
            <ui.Stat title="Wynik" value={String(score)} />
            <ui.Stat title="Trafione" value={String(correct)} color="success" />
            <ui.Stat title="Pudła" value={String(wrong)} color="error" />
            <ui.Stat title="Max combo" value={String(maxCombo)} />
          </ui.Stats>
          <ui.Card><ui.Stack>
            <ui.Row justify="between">
              <ui.Text>Celność</ui.Text>
              <ui.Text bold>{correct + wrong > 0 ? Math.round((correct / (correct + wrong)) * 100) : 0}%</ui.Text>
            </ui.Row>
            {isChallenge && <ui.Row justify="between">
              <ui.Text>Próg</ui.Text>
              <ui.Badge color={won ? 'success' : 'error'}>{correct}/{WIN_THRESHOLD}</ui.Badge>
            </ui.Row>}
          </ui.Stack></ui.Card>
        </ui.Stack>}
        bottom={<ui.Stack>
          {isChallenge ? (<>
            {!won && <ui.Button size="lg" color="primary" block onClick={() => useGame.setState(freshGame())}><RotateCcw size={16} /> Ponów</ui.Button>}
            <ui.Button size="lg" color={won ? 'primary' : undefined} outline={!won} block onClick={() => { useGame.setState({ phase: 'menu' }); backToTree() }}>
              <ArrowLeft size={16} /> Drzewo
            </ui.Button>
          </>) : (<>
            <ui.Button size="lg" color="primary" block onClick={() => useGame.setState(freshGame())}><RotateCcw size={16} /> Jeszcze raz!</ui.Button>
            <ui.Button size="lg" outline block onClick={() => useGame.setState({ phase: 'menu' })}>Menu</ui.Button>
          </>)}
        </ui.Stack>}
      /></ui.Stage></ui.Page>
    )
  }

  // --- CheatSheet: deleguje do shared bqHelpers.CheatSheet ---
  function CheatSheet() {
    const { phase, holeTermIds } = useGame()
    if (phase !== 'playing') return null
    const Shared = (sdk.shared.getState() as any)?.bqHelpers?.CheatSheet
    if (!Shared) return null
    const holeSet = new Set(holeTermIds || [])
    return <Shared
      filter={(id: string) => holeSet.has(id)}
      onBack={backToTree}
      backIcon={ArrowLeft}
    />
  }

  const SharedProgress = () => { const P = (sdk.shared.getState() as any)?.bqHelpers?.Progress; return P ? <P /> : null }

  sdk.registerView('bqa.left', { slot: 'left', component: CheatSheet })
  sdk.registerView('bqa.center', { slot: 'center', component: Arena })
  sdk.registerView('bqa.right', { slot: 'right', component: SharedProgress })
  return { id: 'plugin-brain-quest-arena', label: 'BQ Arena', icon: Zap, version: '0.5.0' }
}
export default plugin
