import { Injectable, signal } from '@angular/core';

export type Lang = 'en' | 'my';

/**
 * Words on screen in English and Burmese. Snapshots are ခြေရာ ("footprints")
 * in Burmese, after the name. `{n}` and other braces are filled in by `t`.
 */
const WORDS = {
  explore: { en: 'Explore', my: 'ရှာဖွေရန်' },
  signIn: { en: 'Sign in', my: 'ဝင်ရန်' },
  signUp: { en: 'Sign up', my: 'စာရင်းသွင်းရန်' },
  signOut: { en: 'Sign out', my: 'ထွက်ရန်' },
  new: { en: 'New', my: 'အသစ်' },
  newRepo: { en: 'New repository', my: 'Repository အသစ်' },
  yourProfile: { en: 'Your profile', my: 'သင့်ပရိုဖိုင်' },
  signedInAs: { en: 'Signed in as', my: 'ဝင်ထားသူ' },
  language: { en: 'Language', my: 'ဘာသာစကား' },
  switchLanguage: { en: 'မြန်မာလို ပြပါ', my: 'Show in English' },

  code: { en: 'Code', my: 'ကုဒ်' },
  issues: { en: 'Issues', my: 'ပြဿနာများ' },
  pulls: { en: 'Pull requests', my: 'ပြောင်းလဲမှု အဆိုပြုချက်များ' },
  settings: { en: 'Settings', my: 'ဆက်တင်များ' },
  snapshots: { en: 'Snapshots', my: 'ခြေရာများ' },
  snapshot: { en: 'Snapshot', my: 'ခြေရာ' },

  whatIsSnapshot: { en: 'What is a snapshot?', my: 'ခြေရာ ဆိုတာ ဘာလဲ' },
  snapshotHelp: {
    en: 'A snapshot is a saved moment of the whole project, like a save point in a game. Each one records who changed what, and why. Git calls it a commit.',
    my: 'ခြေရာ တစ်ခုဆိုတာ project တစ်ခုလုံးကို သိမ်းထားတဲ့ အခိုက်အတန့် တစ်ခုပါ၊ ဂိမ်းထဲက save point လိုပါပဲ။ ဘယ်သူက ဘာကို ဘာကြောင့် ပြောင်းခဲ့လဲ ဆိုတာ မှတ်ထားပါတယ်။ Git မှာ commit လို့ ခေါ်ပါတယ်။',
  },
  gotIt: { en: 'Got it', my: 'နားလည်ပြီ' },
  snapshotsOn: { en: 'Snapshots on {day}', my: '{day} ရက်က ခြေရာများ' },
  noSnapshots: { en: 'No snapshots yet.', my: 'ခြေရာ မရှိသေးပါ။' },
  noSnapshotsHere: { en: 'No snapshots touch this path.', my: 'ဒီလမ်းကြောင်းကို ပြောင်းထားတဲ့ ခြေရာ မရှိပါ။' },
  savedBy: { en: '{who} saved this {when}', my: '{who} က {when} သိမ်းခဲ့သည်' },
  seeChanges: { en: 'See what changed', my: 'ဘာပြောင်းလဲ ကြည့်ရန်' },
  browseThen: { en: 'Browse the project at this snapshot', my: 'ဒီခြေရာ အချိန်က project ကို ကြည့်ရန်' },
  previousSnapshot: { en: 'Previous snapshot', my: 'ယခင် ခြေရာ' },
  newer: { en: 'Newer', my: 'ပိုသစ်' },
  older: { en: 'Older', my: 'ပိုဟောင်း' },
  inPath: { en: 'in', my: 'ထဲတွင်' },
  firstSnapshot: { en: 'The first snapshot: everything in it is new.', my: 'ပထမဆုံး ခြေရာ ဖြစ်လို့ အားလုံး အသစ်ပါ။' },

  whatChanged: { en: 'What changed', my: 'ဘာတွေ ပြောင်းသွားလဲ' },
  filesInGroups: { en: '{files} in {groups}', my: 'အုပ်စု {groups} ခုထဲက ဖိုင် {files}' },
  file: { en: 'file', my: 'ဖိုင်' },
  files: { en: 'files', my: 'ဖိုင်' },
  group: { en: 'group', my: 'အုပ်စု' },
  groups: { en: 'groups', my: 'အုပ်စု' },
  linesAdded: { en: 'lines added', my: 'ကြောင်း ထည့်' },
  linesRemoved: { en: 'lines removed', my: 'ကြောင်း ဖျက်' },
  nothingChanged: { en: 'No files changed.', my: 'ပြောင်းထားတဲ့ ဖိုင် မရှိပါ။' },
  g_code: { en: 'Code', my: 'ကုဒ်' },
  g_tests: { en: 'Tests', my: 'စမ်းသပ်ချက်' },
  g_config: { en: 'Settings & setup', my: 'ဆက်တင်ဖိုင်' },
  g_docs: { en: 'Docs', my: 'စာရွက်စာတမ်း' },
  g_assets: { en: 'Images & media', my: 'ပုံနှင့် မီဒီယာ' },
  g_generated: { en: 'Generated', my: 'အလိုအလျောက် ထုတ်ထားသော' },
  showGroup: { en: 'Show only {group}', my: '{group} သာ ပြရန်' },
  showAll: { en: 'Show all', my: 'အားလုံး ပြရန်' },
  changeMap: { en: 'Change map', my: 'ပြောင်းလဲမှု မြေပုံ' },
  changeMapHelp: {
    en: 'Each box is a changed file, grouped by folder. Bigger boxes changed more lines.',
    my: 'အကွက် တစ်ခုစီသည် ပြောင်းထားတဲ့ ဖိုင် တစ်ခု ဖြစ်ပြီး folder အလိုက် စုထားပါတယ်။ အကွက် ကြီးလေ ပြောင်းထားတဲ့ စာကြောင်း များလေ။',
  },
  functions: { en: 'Functions and classes', my: 'Function နှင့် class များ' },
  added: { en: 'Added', my: 'ထည့်ထားသည်' },
  changed: { en: 'Changed', my: 'ပြင်ထားသည်' },
  removed: { en: 'Removed', my: 'ဖယ်ထားသည်' },
  movedSym: { en: 'Moved to another file', my: 'အခြားဖိုင်သို့ ရွှေ့ထားသည်' },
  realChanges: { en: 'Real changes', my: 'တကယ့် ပြောင်းလဲမှုများ' },
  probablySkip: { en: 'You can probably skip', my: 'ကျော်ဖတ်နိုင်သည်' },
  n_generated: { en: 'Generated file', my: 'အလိုအလျောက် ထုတ်ထားသော ဖိုင်' },
  n_rename: { en: 'Renamed, not edited', my: 'နာမည်သာ ပြောင်းထားသည်' },
  n_whitespace: { en: 'Only spacing changed', my: 'နေရာလွတ်များသာ ပြောင်းထားသည်' },
  n_mode: { en: 'No content changes', my: 'အကြောင်းအရာ မပြောင်းပါ' },
  k_new: { en: 'new', my: 'အသစ်' },
  k_deleted: { en: 'deleted', my: 'ဖျက်ထား' },
  k_renamed: { en: 'renamed', my: 'နာမည်ပြောင်း' },
  k_modified: { en: 'edited', my: 'ပြင်ထား' },
  beforeAfter: { en: 'Before / After', my: 'အရင် / အခု' },
  unified: { en: 'One column', my: 'တစ်တိုင်တည်း' },
  before: { en: 'Before', my: 'အရင်' },
  after: { en: 'After', my: 'အခု' },
  showAs: { en: 'Show changes as', my: 'ပြောင်းလဲမှုကို ပြပုံ' },
  movedLine: { en: 'Moved, not changed', my: 'နေရာသာ ရွှေ့ထားသည်' },
  legendWords: { en: 'Highlighted words changed inside a line', my: 'အရောင်တင်ထားတဲ့ စကားလုံးများ ပြောင်းထားသည်' },
  legendMoved: { en: 'Moved lines', my: 'ရွှေ့ထားသော စာကြောင်းများ' },
  binaryFile: { en: 'Binary file not shown.', my: 'Binary ဖိုင်ကို မပြပါ။' },
  tooLarge: { en: 'This change is too large to show.', my: 'ဒီပြောင်းလဲမှုက ပြရန် ကြီးလွန်းသည်။' },
  noContent: { en: 'No content changes (an empty file, or only its permissions changed).', my: 'အကြောင်းအရာ မပြောင်းပါ (ဖိုင်အလွတ် သို့မဟုတ် ခွင့်ပြုချက်သာ ပြောင်းထားသည်)။' },
  hide: { en: 'Hide', my: 'ဖျောက်ရန်' },
  show: { en: 'Show', my: 'ပြရန်' },
  viewFile: { en: 'View file', my: 'ဖိုင်ကြည့်ရန်' },
  changedFiles: { en: 'Changed files', my: 'ပြောင်းထားသော ဖိုင်များ' },

  kumal: { en: 'KuMal', my: 'ကူမယ်' },
  kumalHelp: { en: 'Explains this change in plain words, using Claude.', my: 'ဒီပြောင်းလဲမှုကို Claude သုံးပြီး ရိုးရိုးလေး ရှင်းပြပေးပါတယ်။' },
  explain: { en: 'Explain in plain words', my: 'ရိုးရိုးလေး ရှင်းပြပါ' },
  explaining: { en: 'KuMal is reading the change…', my: 'ကူမယ် ဖတ်နေပါတယ်…' },
  explainIn: { en: 'Explain in', my: 'ရှင်းပြမည့် ဘာသာ' },
  signInForKumal: { en: 'Sign in to ask KuMal.', my: 'ကူမယ်ကို မေးရန် ဝင်ပါ။' },
  aiNote: { en: 'Written by AI. Check it against the changes below.', my: 'AI ရေးထားခြင်း ဖြစ်သည်။ အောက်က ပြောင်းလဲမှုများနှင့် တိုက်စစ်ပါ။' },

  timeTravel: { en: 'Time travel', my: 'အချိန်ခရီး' },
  timeTravelHelp: {
    en: "Slide through every snapshot of this file to watch it grow. Colours show each line's age: warm lines are recent, cool lines are old.",
    my: 'ဒီဖိုင်ရဲ့ ခြေရာတိုင်းကို ဆွဲကြည့်ပြီး ဘယ်လို ကြီးထွားလာလဲ ကြည့်ပါ။ အရောင်က စာကြောင်း သက်တမ်းကို ပြပါတယ် - နွေးတဲ့ အရောင်က အသစ်၊ အေးတဲ့ အရောင်က အဟောင်း။',
  },
  versionOf: { en: 'Snapshot {i} of {n}', my: 'ခြေရာ {n} ခုထဲက {i}' },
  play: { en: 'Play', my: 'ဖွင့်ပြရန်' },
  pause: { en: 'Pause', my: 'ခဏရပ်' },
  previous: { en: 'Previous', my: 'ယခင်' },
  next: { en: 'Next', my: 'နောက်' },
  oldest: { en: 'Oldest', my: 'အဟောင်းဆုံး' },
  newest: { en: 'Newest', my: 'အသစ်ဆုံး' },
  newHere: { en: 'New in this snapshot', my: 'ဒီခြေရာမှာ အသစ်' },
  lineAge: { en: 'Line age', my: 'စာကြောင်း သက်တမ်း' },
  renamedFrom: { en: 'Called {path} at this point', my: 'ဒီအချိန်တုန်းက နာမည် {path}' },
  linesOf: { en: '{n} lines', my: 'စာကြောင်း {n}' },
  cantPlay: { en: "This file can't be played back (it's binary or very large).", my: 'ဒီဖိုင်ကို ပြန်ဖွင့်ပြ၍ မရပါ (binary သို့မဟုတ် ကြီးလွန်းသည်)။' },
  loading: { en: 'Loading…', my: 'ဖွင့်နေသည်…' },
} satisfies Record<string, Record<Lang, string>>;

export type WordKey = keyof typeof WORDS;

/** The interface language, kept in this browser. Pages call `t` in templates, so they follow a switch at once. */
@Injectable({ providedIn: 'root' })
export class I18n {
  readonly lang = signal<Lang>(I18n.saved());

  private static saved(): Lang {
    try {
      return localStorage.getItem('lang') === 'my' ? 'my' : 'en';
    } catch {
      return 'en';
    }
  }

  constructor() {
    document.documentElement.lang = this.lang();
  }

  t(key: WordKey, params: Record<string, string | number> = {}): string {
    let text: string = WORDS[key][this.lang()];
    for (const [k, v] of Object.entries(params)) text = text.replace(`{${k}}`, String(v));
    return text;
  }

  toggle() {
    const next: Lang = this.lang() === 'en' ? 'my' : 'en';
    this.lang.set(next);
    document.documentElement.lang = next;
    try {
      localStorage.setItem('lang', next);
    } catch {
      /* storage blocked; the choice lasts until reload */
    }
  }
}
