import { normalize } from './matching-text';

const WRAPPER_WORDS = new Set(
  'please kindly enter provide share mention select choose indicate specify tell state what whats s your you the a an is are was were would could can do does how many much of to in for us me have has been with using this these that'.split(
    ' ',
  ),
);
const AMOUNT_WORDS = new Set(
  'inr rupee rupees rs usd eur gbp cad aud sgd dollar dollars euro euros lakh lakhs lac lacs lpa crore crores thousand thousands million millions amount'.split(
    ' ',
  ),
);
const EXPERIENCE_WORDS = new Set(
  'total overall professional work working worked employment number these this fields field relevant additional long'.split(
    ' ',
  ),
);
const NOTICE_WORDS = new Set(
  'notice period duration length time current currently contractual contract join joining start starting work working employment availability available ready earliest soon long within after before from if offered offer accepted accepting acceptance role position job opportunity selected successful able be will required need needed number calendar days day weeks week months month years year'.split(
    ' ',
  ),
);
const CURRENCIES = new Map<string, string>(
  Object.entries({
    inr: 'INR',
    rupee: 'INR',
    rupees: 'INR',
    rs: 'INR',
    usd: 'USD',
    dollar: 'DOLLAR',
    dollars: 'DOLLAR',
    eur: 'EUR',
    euro: 'EUR',
    euros: 'EUR',
    gbp: 'GBP',
    cad: 'CAD',
    aud: 'AUD',
    sgd: 'SGD',
  }),
);

type Topic = 'ctc' | 'salary' | 'compensation' | 'notice' | 'experience' | 'institution';
type ResponseKind =
  | 'amount'
  | 'duration'
  | 'boolean'
  | 'description'
  | 'date'
  | 'percentage'
  | 'name';
type PayPeriod = 'year' | 'month' | 'week' | 'day' | 'hour' | 'mixed';
type AmountScale = 'lakh' | 'crore' | 'thousand' | 'million';

function monetarySymbols(text: string): string {
  return text
    .replace(/₹/g, ' INR ')
    .replace(/€/g, ' EUR ')
    .replace(/£/g, ' GBP ')
    .replace(/\$/g, ' dollars ');
}

/** Explicit currency, scale and period signals; no default units are inferred. */
export function monetaryFormat(raw: string): {
  currencies: string[];
  scales: AmountScale[];
  periods: Exclude<PayPeriod, 'mixed'>[];
} {
  const words = normalize(monetarySymbols(raw)).split(' '),
    text = words.join(' ');
  const scales: AmountScale[] = [];
  if (words.some((word) => ['lakh', 'lakhs', 'lac', 'lacs', 'lpa'].includes(word)))
    scales.push('lakh');
  if (words.some((word) => ['crore', 'crores'].includes(word))) scales.push('crore');
  if (words.some((word) => ['thousand', 'thousands'].includes(word))) scales.push('thousand');
  if (words.some((word) => ['million', 'millions'].includes(word))) scales.push('million');
  const periods: Exclude<PayPeriod, 'mixed'>[] = [];
  if (/\b(annual|annually|annum|year|yearly|lpa)\b/.test(text)) periods.push('year');
  if (/\b(month|monthly)\b/.test(text)) periods.push('month');
  if (/\b(week|weekly)\b/.test(text)) periods.push('week');
  if (/\b(day|daily)\b/.test(text)) periods.push('day');
  if (/\b(hour|hourly)\b/.test(text)) periods.push('hour');
  return {
    currencies: [
      ...new Set(
        words.map((word) => CURRENCIES.get(word)).filter((value): value is string => !!value),
      ),
    ],
    scales,
    periods,
  };
}

export interface MatchingTerms {
  keywords: string[];
  topic?: Topic;
  responseKind?: ResponseKind;
  compensation: boolean;
  currency?: string;
  amountUnit?: 'base' | 'lakh' | 'crore' | 'thousand' | 'million';
  payPeriod?: PayPeriod;
  payComponent?: 'total' | 'fixed' | 'variable' | 'bonus' | 'equity';
  noticeUnit?: 'day' | 'week' | 'month' | 'year';
  noticeSubjects?: string[];
  experienceUnit?: 'year' | 'month' | 'combined';
  experienceScope?: 'total' | 'relevant' | 'additional';
  experienceSubjects?: string[];
  institutionQualifiers?: string[];
}

function responseKind(text: string): ResponseKind {
  text = text.replace(/^(?:(?:please|kindly) )+/, '');
  if (/^(?:describe|summarize|explain)\b|\btell us about\b|\bdescription\b/.test(text))
    return 'description';
  if (/^(?:do|does|did|are|is|have|has|will|would|can|could)\b/.test(text)) return 'boolean';
  return 'duration';
}

/** Topic normalization preserves skills and qualifiers instead of fuzzy substring guesses. */
export function matchingTerms(raw: string): MatchingTerms {
  let text = normalize(
    monetarySymbols(raw.replace(/\bc\+\+/gi, ' cpp ').replace(/\bc#/gi, ' csharp ')).replace(
      /%/g,
      ' percent ',
    ),
  )
    .replace(/\bc t c\b/g, 'ctc')
    .replace(/\bcost to company\b/g, 'ctc');
  let topic: Topic | undefined = /\bctc\b/.test(text)
    ? 'ctc'
    : /\bsalary\b/.test(text)
      ? 'salary'
      : /\b(compensation|pay|remuneration)\b/.test(text)
        ? 'compensation'
        : undefined;
  const compensation = !!topic;
  let kind: ResponseKind | undefined;
  let payPeriod: PayPeriod | undefined;
  let payComponent: MatchingTerms['payComponent'];
  const joiningDuration =
    /\b(join|joining|start|starting)\b/.test(text) &&
    (/\b(?:how many|number of) (?:calendar |working |business )?(?:days?|weeks?|months?|years?)\b|\bhow (?:soon|long)\b/.test(
      text,
    ) ||
      /\b(?:availability|available|joining|join)\b.*\bin (?:days?|weeks?|months?)\b/.test(text)) &&
    !/\bdate\b|\bwhen\b/.test(text);
  if (compensation) {
    text = text
      .replace(/\b(desired|target)\b/g, 'expected')
      .replace(/\bpresent\b/g, 'current')
      .replace(/\blast drawn\b/g, 'current')
      .replace(/\b(salary|compensation|pay) expectations?\b/g, 'expected $1')
      .replace(/\bexpectations? (?:for|of)\b/g, 'expected')
      // CTC already includes these components; the clarification is not a
      // request for the variable component by itself.
      .replace(
        /\b(?:including|inclusive of) (?:any |all |both |the |your )?(?:fixed and )?variable (?:components?|pay|compensation|bonus)\b/g,
        ' ',
      );
    // "CTC salary" and "CTC compensation" repeat the same noun. Keep
    // current/expected, fixed/variable and all currency/unit qualifiers.
    if (topic === 'ctc') text = text.replace(/\b(salary|compensation|pay|remuneration)\b/g, ' ');
    kind = /\b(percent|percentage)\b/.test(text)
      ? 'percentage'
      : /^(?:describe|summarize|explain)\b|\btell us about\b/.test(text)
        ? 'description'
        : /\b(negotiable|negotiability)\b/.test(text)
          ? 'boolean'
          : 'amount';
    payComponent = /\b(?:fixed|base)\b|\bexcluding variable\b/.test(text)
      ? 'fixed'
      : /\bvariable\b/.test(text)
        ? 'variable'
        : /\bbonus\b/.test(text)
          ? 'bonus'
          : /\b(equity|stock)\b/.test(text)
            ? 'equity'
            : 'total';
    const { periods } = monetaryFormat(text);
    payPeriod = periods.length > 1 ? 'mixed' : periods[0] || (topic === 'ctc' ? 'year' : undefined);
  } else if (/\bnotice (?:period|duration)\b/.test(text) || joiningDuration) {
    topic = 'notice';
    // A conditional follow-up about joining does not replace the primary
    // duration question. Absolute joining-date questions remain separate.
    text = text
      .replace(
        /\bif you (?:are|re) (?:already )?(?:serving|on) (?:a )?notice\b.*\b(?:join|joining|start)\b.*$/,
        '',
      )
      .replace(/\bnotice duration\b/g, 'notice period')
      .replace(/\b(?:working|business) days?\b/g, 'business days');
    kind = /\bdate\b|\blast working day\b/.test(text)
      ? 'date'
      : joiningDuration
        ? 'duration'
        : responseKind(text);
  } else if (
    /\bexperience\b/.test(text) ||
    (/\b(worked|working)\b/.test(text) && /\b(years?|months?|how long)\b/.test(text))
  ) {
    topic = 'experience';
    kind = responseKind(text);
    text = text
      .replace(/\b(worked|working)\b/g, 'experience')
      .replace(/\bjava script\b/g, 'javascript')
      .replace(/\btype script\b/g, 'typescript');
  } else if (
    /\b(school|college|university|institution|institute)\b/.test(text) &&
    /\bname\b/.test(text)
  ) {
    topic = 'institution';
    kind = 'name';
    // Preserve distinctions such as high school, most recent, degree level,
    // address and graduation year; only interchangeable institution nouns merge.
    text = text
      .replace(/\b(school|college|university|institution|institute)\b/g, 'institution')
      .replace(/\b(?:or|educational)\b/g, ' ');
  }
  const words = text.split(' ').filter(Boolean);
  const format = monetaryFormat(text);
  const currency = compensation ? format.currencies[0] : undefined;
  let amountUnit: MatchingTerms['amountUnit'];
  if (compensation) {
    amountUnit = format.scales[0] || (currency ? 'base' : undefined);
  }
  const noticeWord =
    topic === 'notice'
      ? words.find((word) => /^(days?|weeks?|months?|years?)$/.test(word))
      : undefined;
  const noticeUnit = noticeWord?.replace(/s$/, '') as MatchingTerms['noticeUnit'];
  let experienceUnit: MatchingTerms['experienceUnit'];
  let experienceScope: MatchingTerms['experienceScope'];
  if (topic === 'experience') {
    const years = words.some((word) => /^years?$/.test(word));
    const months = words.some((word) => /^months?$/.test(word));
    experienceUnit = years && months ? 'combined' : months ? 'month' : 'year';
    experienceScope = words.includes('additional')
      ? 'additional'
      : words.includes('relevant')
        ? 'relevant'
        : 'total';
  }
  const keywords = [
    ...new Set([
      ...words.filter((word) => {
        if (WRAPPER_WORDS.has(word)) return false;
        if (
          compensation &&
          (AMOUNT_WORDS.has(word) ||
            /^(per|annual|annually|annum|year|yearly|month|monthly|week|weekly|day|daily|hour|hourly)$/.test(
              word,
            ) ||
            (topic === 'ctc' && ['total', 'overall'].includes(word)))
        )
          return false;
        if (topic === 'notice' && kind === 'duration' && NOTICE_WORDS.has(word)) return false;
        if (
          topic === 'experience' &&
          (EXPERIENCE_WORDS.has(word) || /^(years?|months?)$/.test(word))
        )
          return false;
        return true;
      }),
      ...(topic === 'notice' && kind === 'duration' ? ['notice', 'period'] : []),
    ]),
  ].sort();
  return {
    keywords,
    topic,
    responseKind: kind,
    compensation,
    currency,
    amountUnit,
    payPeriod,
    payComponent,
    noticeUnit,
    experienceUnit,
    experienceScope,
    ...(topic === 'notice' && kind === 'duration'
      ? { noticeSubjects: keywords.filter((word) => !['notice', 'period'].includes(word)) }
      : {}),
    ...(topic === 'experience'
      ? { experienceSubjects: keywords.filter((word) => word !== 'experience') }
      : {}),
    ...(topic === 'institution'
      ? {
          institutionQualifiers: keywords.filter((word) => !['institution', 'name'].includes(word)),
        }
      : {}),
  };
}

/** An explicit duration in a saved value is also a unit signal. Never convert it. */
export function savedMatchingTerms(label: string, value: string): MatchingTerms {
  const terms = matchingTerms(label);
  if (terms.topic === 'notice' && terms.responseKind === 'duration' && !terms.noticeUnit) {
    const unit = normalize(value).match(/^\d+(?: \d+)? (days?|weeks?|months?|years?)$/)?.[1];
    if (unit) terms.noticeUnit = unit.replace(/s$/, '') as MatchingTerms['noticeUnit'];
  }
  return terms;
}

function sameList(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((word, index) => word === right[index]);
}

/** An alias can add detail, but cannot discard the saved field's meaningful qualifiers. */
export function aliasTerms(label: MatchingTerms, alias: MatchingTerms): MatchingTerms | undefined {
  if (
    (label.currency && alias.currency && label.currency !== alias.currency) ||
    (label.amountUnit && alias.amountUnit && label.amountUnit !== alias.amountUnit) ||
    (label.noticeUnit && alias.noticeUnit && label.noticeUnit !== alias.noticeUnit) ||
    (label.payPeriod && alias.payPeriod && label.payPeriod !== alias.payPeriod) ||
    (label.payComponent && alias.payComponent && label.payComponent !== alias.payComponent) ||
    (label.responseKind && alias.responseKind && label.responseKind !== alias.responseKind) ||
    (label.noticeSubjects?.length &&
      alias.noticeSubjects?.length &&
      !sameList(label.noticeSubjects, alias.noticeSubjects)) ||
    (label.institutionQualifiers?.length &&
      alias.institutionQualifiers?.length &&
      !sameList(label.institutionQualifiers, alias.institutionQualifiers)) ||
    (label.experienceUnit &&
      alias.experienceUnit &&
      label.experienceUnit !== alias.experienceUnit) ||
    (label.experienceScope &&
      alias.experienceScope &&
      label.experienceScope !== alias.experienceScope) ||
    (label.experienceSubjects?.length &&
      alias.experienceSubjects?.length &&
      !sameList(label.experienceSubjects, alias.experienceSubjects))
  )
    return undefined;
  return {
    ...alias,
    topic: alias.topic || label.topic,
    responseKind: label.responseKind || alias.responseKind,
    compensation: label.compensation || alias.compensation,
    currency: label.currency || alias.currency,
    amountUnit: label.amountUnit || alias.amountUnit,
    payPeriod: label.payPeriod || alias.payPeriod,
    payComponent: label.payComponent || alias.payComponent,
    noticeUnit: label.noticeUnit || alias.noticeUnit,
    noticeSubjects: label.noticeSubjects?.length ? label.noticeSubjects : alias.noticeSubjects,
    experienceUnit: label.experienceUnit || alias.experienceUnit,
    experienceScope: label.experienceScope || alias.experienceScope,
    experienceSubjects: label.experienceSubjects?.length
      ? label.experienceSubjects
      : alias.experienceSubjects,
    institutionQualifiers: label.institutionQualifiers?.length
      ? label.institutionQualifiers
      : alias.institutionQualifiers,
  };
}

export function sameKeywords(left: MatchingTerms, right: MatchingTerms): boolean {
  const enough =
    left.keywords.length >= 2 ||
    (left.topic === 'experience' && right.topic === 'experience' && left.keywords.length > 0);
  return enough && sameList(left.keywords, right.keywords);
}

export interface MatchCompatibility {
  priority: 0 | 1 | 3;
  reason?: 'units' | 'notice-units' | 'meaning';
}

/** Explicit units outrank the requested lakh fallback; values never convert. */
export function matchCompatibility(
  answer: MatchingTerms,
  question: MatchingTerms,
): MatchCompatibility {
  if (answer.topic && question.topic && answer.topic !== question.topic)
    return { priority: 0, reason: 'meaning' };
  if (answer.responseKind && question.responseKind && answer.responseKind !== question.responseKind)
    return { priority: 0, reason: 'meaning' };
  if (
    answer.payPeriod === 'mixed' ||
    question.payPeriod === 'mixed' ||
    (answer.payPeriod && question.payPeriod && answer.payPeriod !== question.payPeriod) ||
    (answer.payComponent && question.payComponent && answer.payComponent !== question.payComponent)
  )
    return { priority: 0, reason: 'meaning' };
  if (
    answer.topic === 'experience' &&
    question.topic === 'experience' &&
    (answer.experienceUnit !== question.experienceUnit ||
      answer.experienceScope !== question.experienceScope ||
      !sameList(answer.experienceSubjects || [], question.experienceSubjects || []))
  )
    return { priority: 0, reason: 'meaning' };
  if (
    answer.topic === 'notice' &&
    question.topic === 'notice' &&
    answer.responseKind === 'duration' &&
    question.responseKind === 'duration'
  ) {
    if ((answer.noticeUnit || 'day') !== (question.noticeUnit || 'day'))
      return { priority: 0, reason: 'notice-units' };
    if (!sameList(answer.noticeSubjects || [], question.noticeSubjects || []))
      return { priority: 0, reason: 'meaning' };
  }
  if (
    answer.topic === 'institution' &&
    question.topic === 'institution' &&
    !sameList(answer.institutionQualifiers || [], question.institutionQualifiers || [])
  )
    return { priority: 0, reason: 'meaning' };
  if (answer.compensation && question.compensation) {
    if (
      !question.amountUnit &&
      !question.currency &&
      question.topic === 'ctc' &&
      answer.amountUnit === 'lakh' &&
      (!answer.currency || answer.currency === 'INR')
    )
      return { priority: 1 };
    // This local edition treats unqualified CTC answers as lakh values. An
    // explicitly saved lakh variant still wins over this generic fallback.
    if (
      answer.topic === 'ctc' &&
      question.topic === 'ctc' &&
      !answer.amountUnit &&
      !answer.currency &&
      question.amountUnit === 'lakh' &&
      (!question.currency || question.currency === 'INR')
    )
      return { priority: 1 };
    const sameIndianLakh =
      question.topic === 'ctc' &&
      answer.amountUnit === 'lakh' &&
      question.amountUnit === 'lakh' &&
      (!answer.currency || answer.currency === 'INR') &&
      (!question.currency || question.currency === 'INR');
    if (
      answer.amountUnit !== question.amountUnit ||
      (answer.currency !== question.currency && !sameIndianLakh)
    )
      return { priority: 0, reason: 'units' };
  }
  return { priority: 3 };
}
