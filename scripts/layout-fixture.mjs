export const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body><div id="root"></div><script type="module">
import { createElement as h, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import '/src/styles/global.css';
import { createProfile } from '/src/core/profile/defaults.ts';
import { createDemoProfile } from '/src/core/profile/demo.ts';
import { JOURNEY, LEGACY_STAGES } from '/src/core/campaign/journey.ts';
import { createRun } from '/src/core/run/run.ts';
import { BOONS } from '/src/core/run/boons.ts';
import { createTournament } from '/src/core/tournament/bracket.ts';
import { ABILITY_DEFS } from '/src/core/talents/abilities.ts';
import { EMPTY_MATCH_STATS } from '/src/core/talents/types.ts';
import { applyMatchResult } from '/src/core/progression/apply.ts';
import { dayKey } from '/src/core/progression/xp.ts';
import { idleSnapshot } from '/src/game/engine.ts';
import { HomeScreen } from '/src/ui/screens/HomeScreen.tsx';
import { ModesScreen } from '/src/ui/screens/ModesScreen.tsx';
import { WorkshopScreen } from '/src/ui/screens/WorkshopScreen.tsx';
import { COMPONENTS } from '/src/core/equipment/catalog.ts';
import { WORKSHOP_CONTRACTS } from '/src/core/equipment/workshop.ts';
import { DifficultyScreen } from '/src/ui/screens/DifficultyScreen.tsx';
import { JourneyScreen } from '/src/ui/screens/JourneyScreen.tsx';
import { GauntletScreen } from '/src/ui/screens/GauntletScreen.tsx';
import { DailyScreen } from '/src/ui/screens/DailyScreen.tsx';
import { ChallengeScreen } from '/src/ui/screens/ChallengeScreen.tsx';
import { TournamentScreen } from '/src/ui/screens/TournamentScreen.tsx';
import { ProfileScreen } from '/src/ui/screens/ProfileScreen.tsx';
import { TalentScreen } from '/src/ui/screens/TalentScreen.tsx';
import { SettingsScreen } from '/src/ui/screens/SettingsScreen.tsx';
import { CustomizeScreen } from '/src/ui/screens/CustomizeScreen.tsx';
import { AchievementsScreen } from '/src/ui/screens/AchievementsScreen.tsx';
import { HowToPlayScreen } from '/src/ui/screens/HowToPlayScreen.tsx';
import { DemoScreen } from '/src/ui/screens/DemoScreen.tsx';
import { AccountScreen } from '/src/ui/screens/AccountScreen.tsx';
import { ResultScreen } from '/src/ui/screens/ResultScreen.tsx';
import { MatchHud } from '/src/ui/MatchHud.tsx';
import { Hud } from '/src/ui/Hud.tsx';
import { AbilityBar } from '/src/ui/AbilityBar.tsx';
import { OnboardingScreen } from '/src/ui/screens/OnboardingScreen.tsx';
import { Overlay } from '/src/ui/Overlay.tsx';
import { PausePanel } from '/src/ui/panels/PausePanel.tsx';
import { ExitPanel } from '/src/ui/panels/ExitPanel.tsx';
import { TutorialCoach } from '/src/ui/TutorialCoach.tsx';
const root = createRoot(document.getElementById('root'));
let revision = 0;
const noop = () => {};
const components = { home: HomeScreen, workshop: WorkshopScreen, modes: ModesScreen, quick: DifficultyScreen,
  practice: DifficultyScreen, journey: JourneyScreen, gauntlet: GauntletScreen,
  run: GauntletScreen, draft: GauntletScreen, daily: DailyScreen,
  challenge: ChallengeScreen, tournament: TournamentScreen, profile: ProfileScreen, talents: TalentScreen,
  settings: SettingsScreen, customize: CustomizeScreen, achievements: AchievementsScreen,
  help: HowToPlayScreen, demo: DemoScreen, account: AccountScreen, result: ResultScreen,
  onboarding: OnboardingScreen };
window.layoutReview = {
  actions: [],
  async render(name, state = 'fresh') {
    const profile = state === 'fresh' ? createProfile() : createDemoProfile(100, createProfile());
    profile.onboarded = true;
    if (name === 'workshop' && state !== 'fresh') {
      Object.assign(profile.progress.workshop, {introduced:true, marks:9999,
        owned:COMPONENTS.map(c=>c.id), surfaces:['rubber','ceramic'], signatures:1234,
        contracts:Object.fromEntries(WORKSHOP_CONTRACTS.map(c=>[c.id,c.target])),
        equipped:{core:'memory-gel',surface:'split',frame:'extended',insert:'empty-insert',tuning:'grip'}});
      profile.progress.workshop.presets = ['Centre placement paddle', 'Rubbery moving edge kit', '攻撃を受け止めて次の一撃で返すための長い名前'].map(name => ({name,kit:{...profile.progress.workshop.equipped}}));
      profile.progress.run = {...createRun('layout-workshop', 20, Date.now(), 'expedition'), stage:6, credits:6,
        equipment:{version:1,kit:{...profile.progress.workshop.equipped}}};
    }
    if (state !== 'fresh') {
      profile.stats.matches = 50;
      profile.progress.journey = Object.fromEntries(LEGACY_STAGES.map(s => [s.id, 7]));
      profile.progress.runRecords.bestPressure = 49;
    }
    if (state === 'complete')
      profile.progress.journey = Object.fromEntries(JOURNEY.flatMap(w => w.stages).map(s => [s.id, 7]));
    if (name === 'run' || name === 'draft') {
      const run = createRun('layout-review', 20, Date.now(), state === 'deep' ? 'endless' : 'expedition');
      run.stage = state === 'deep' ? 1002 : state === 'last-act' ? 30 : 6;
      if (state === 'deep') run.actOffset = 3;
      if (state === 'committed') run.attempt = { stage: run.stage };
      run.credits = 6;
      run.boons = Object.fromEntries(BOONS.filter(b => b.family !== 'relic' && !b.instant).slice(0, 25).map(b => [b.id, 1]));
      run.results = Array.from({length:6}, (_,i) => ({stage:run.stage - 6 + i, won:true, you:5, bot:2}));
      if (name === 'draft') run.offer = BOONS.slice(0, 3).map(b => b.id);
      profile.progress.run = run;
    }
    if (name === 'tournament' && state === 'active') profile.tournament = createTournament(6, Date.now(), 'marathon');
    const result = {mode:'quick', ranked:true, botId:'pro', botRank:3, won:true,
      scoreYou:5, scoreBot:2, bestRally:24, hits:30, seconds:120, livesLeft:0,
      objectiveMet:true, objective:null, talent:EMPTY_MATCH_STATS, flicks:3,
      shutout:false, comeback:false, abandoned:false, day:dayKey(new Date())};
    if (name === 'result') {
      if (state === 'journey') Object.assign(result, {mode:'campaign', stageId:JOURNEY[5].stages[0].id});
      if (state === 'daily') Object.assign(result, {mode:'daily', dailyKey:'m2-' + result.day});
      if (state === 'waves') Object.assign(result, {mode:'endless', waves:12, scoreYou:0, scoreBot:0});
      if (['run', 'endless-run', 'far-endless-run', 'run-loss'].includes(state)) {
        const run = createRun('layout-result', 20, Date.now(), state.includes('endless-run') ? 'endless' : 'expedition');
        run.stage = state === 'far-endless-run' ? 1000000000002 : state === 'endless-run' ? 1002 : 6;
        profile.progress.run = run;
        Object.assign(result, {mode:'run', runStage:run.stage});
        if (state === 'run-loss') Object.assign(result, {won:false, scoreYou:2, scoreBot:5});
      }
    }
    const skill = (def, i) => ({slot:i, id:def.id, name:def.name, talent:def.talent,
      ready:i === 0, active:i === 1, cooldownLeft:i > 1 ? 12 : 0, hue:def.hue,
      progress:i === 0 ? 1 : .4, castId:0, refreshId:0, ultimate:!!def.ultimate,
      remain:0, duration:0, charges:0, maxCharges:0});
    const snapshot = {...idleSnapshot(), mode:state === 'goals' ? 'campaign' : 'quick',
      scoreYou:3, scoreBot:2, winScore:5, canPause:true, opponentName:'Legend · opportunist',
      rallyPressure:40, enemyAbilities:ABILITY_DEFS.slice(0,4).map(skill),
      paddleKit:'Memory gel · Split surface · Extended frame · Grip tuning',
      opponentKit:'Springsteel · Ceramic', materialCharge:true,
      goals:state === 'goals' ? [{id:'win', label:'Win the match',progress:'3 / 5 points',state:'active'},
        {id:'rails',label:'Land 6 rail banks',progress:'4 / 6 rail banks',state:'reached'},
        {id:'margin',label:'Win by two points',progress:'1 / 2 points',state:'active'}] : []};
    window.layoutReview.actions = [];
    const props = {profile, account:{status:'guest',pending:0}, demoLevel:null,
      practice:name === 'practice', onStart:(...args)=>window.layoutReview.actions.push(args),
      onPick:(...args)=>window.layoutReview.actions.push(args), onPlay:noop, onBack:noop,
      onAbandon:noop, onModes:noop, onExitDemo:noop, onProfile:noop, onTalents:noop,
      onSettings:noop, onHelp:noop, onAccount:noop, onAchievements:noop, onCustomize:noop, onDemo:noop,
      onWorkshop:noop, onBench:noop, onDone:noop,
      onPreview:noop, onMusicPreview:noop, onStopPreview:noop, onTutorial:noop, onPractice:noop, onExit:noop};
    if (name === 'result') Object.assign(props, {result, summary:applyMatchResult(profile,result),
      label:'Quick Match', primaryLabel:'Play again', secondaryLabel:'Menu', onPrimary:noop, onSecondary:noop});
    root.render(['pause', 'exit'].includes(name) ? h(Overlay, {key:++revision,show:true,label:name==='pause'?'Paused':'Leave bBall?',onDismiss:noop},
      name==='pause' ? h(PausePanel,{label:'Gold Cup · Final',score:{you:3,bot:2},goals:snapshot.goals,
        enemyAbilities:snapshot.enemyAbilities,onResume:noop,onSettings:noop,onRestart:noop,onQuit:noop})
        : h(ExitPanel,{native:false,onExit:noop,onCancel:noop})) : name==='tutorial' ? h(TutorialCoach,
      {key:++revision,snapshot:{...snapshot,tutorialStep:state==='complete'?'complete':'move',tutorialCleared:false},
        onSend:noop,onNext:noop,onPractice:noop,onRestart:noop,onExit:noop}) : name === 'match' ? h(Fragment,{key:++revision},
      h(MatchHud,{snapshot,objective:'Rally pressure: after 24 returns both paddles narrow, up to 40%',onGoals:noop}),
      ...(state==='skills' ? [h(AbilityBar,{abilities:ABILITY_DEFS.slice(0,9).map(skill),show:true,side:'right',onUse:noop})] : []),
      h(Hud,{muted:false,canPause:true,onToggleMute:noop,onPause:noop})) : h(Fragment,{key:++revision},
      h(components[name],props),h(Hud,{muted:false,canPause:false,onToggleMute:noop,onPause:noop})));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }
};
</script></body></html>`;
