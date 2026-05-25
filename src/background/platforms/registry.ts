import type {
  PlatformId,
  PlatformPlaybook,
  ResolvePlatformContextInput,
  ResolvedPlatformContext,
  ResolvedPlatformMatch,
} from './types'

const PLATFORM_PLAYBOOKS: PlatformPlaybook[] = [
  {
    id: 'youtube',
    name: 'YouTube',
    hostPatterns: [/^(?:www\.)?youtube\.com$/i, /^m\.youtube\.com$/i, /^youtu\.be$/i],
    urlPatterns: [/youtube\.com\/watch/i, /youtube\.com\/results/i, /youtu\.be\//i],
    promptKeywords: ['youtube', 'video', 'watch', 'play', 'playlist', 'channel', 'subscribe'],
    pageMarkers: ['ytd-app', 'ytd-searchbox', 'ytd-video-renderer', 'ytd-watch-flexy'],
    selectorAliases: {
      searchInput: 'input#search',
      searchButton: 'button[aria-label*="Search"]',
      resultItem: 'ytd-video-renderer',
      resultLink: 'ytd-video-renderer a#video-title',
      watchVideo: 'video',
    },
    plannerHints: [
      'Use the search box, wait for results, then click the first relevant video title.',
      'Prefer ytd-video-renderer or search-result-renderer when waiting for results.',
      'If a watch page does not open, treat the run as incomplete and re-evaluate the result click.',
    ],
    recoveryHints: [
      'Search YouTube instead of navigating directly to a watch URL when a result is needed.',
      'If the result page is unstable, verify the active tab is on youtube.com/watch before declaring success.',
    ],
    verificationHints: [
      'Success should require a watch page with a playing video element.',
      'A generic button click is not enough if playback never starts.',
    ],
  },
  {
    id: 'google-search',
    name: 'Google Search',
    hostPatterns: [/^(?:www\.)?google\.[a-z.]+$/i],
    urlPatterns: [/google\.[a-z.]+\/search/i],
    promptKeywords: ['google', 'search', 'find', 'lookup', 'look up', 'search for'],
    pageMarkers: ['input[name="q"]', 'textarea[name="q"]', '#search', '#searchform'],
    selectorAliases: {
      searchInput: 'input[name="q"]',
      searchButton: 'button[type="submit"], input[type="submit"]',
      resultLink: 'a h3',
      resultTitle: 'h3',
    },
    plannerHints: [
      'Search terms belong in the main query box before clicking the submit button.',
      'Wait for search results to load before clicking a result.',
      'If the direct page is missing, fall back to a web search query first.',
    ],
    recoveryHints: [
      'Use Google search when direct navigation fails or a page looks wrong.',
      'Prefer the primary search input rather than site-specific controls when the page is ambiguous.',
    ],
    verificationHints: [
      'A search task succeeds when results are visible and the intended result is opened.',
    ],
  },
  {
    id: 'gmail',
    name: 'Gmail',
    hostPatterns: [/^(?:mail\.)?google\.com$/i],
    urlPatterns: [/mail\.google\.com/i],
    promptKeywords: ['gmail', 'email', 'mail', 'inbox', 'compose', 'send an email'],
    pageMarkers: [
      '[aria-label*="Compose"]',
      'table[role="grid"]',
      'input[aria-label*="Search mail"]',
    ],
    selectorAliases: {
      composeButton: '[aria-label*="Compose"]',
      searchInput: 'input[aria-label*="Search mail"]',
      inboxRow: 'table[role="grid"] tr',
    },
    plannerHints: [
      'Use the search mail box for locating conversations before composing or replying.',
      'Compose actions usually begin with the Compose button and end with Send.',
    ],
    recoveryHints: [
      'If Gmail loads slowly, wait for the inbox grid before selecting mail actions.',
      'When a mailbox is not obvious, search first instead of guessing message threads.',
    ],
    verificationHints: [
      'Check for the expected thread, draft, or sent state before calling the task done.',
    ],
  },
  {
    id: 'google-maps',
    name: 'Google Maps',
    hostPatterns: [/^(?:www\.)?google\.[a-z.]+$/i, /^maps\.google\.com$/i],
    urlPatterns: [/maps\.google\./i],
    promptKeywords: ['map', 'maps', 'directions', 'location', 'near me', 'route'],
    pageMarkers: [
      'input#searchboxinput',
      '[aria-label*="Directions"]',
      '[aria-label*="Search Google Maps"]',
    ],
    selectorAliases: {
      searchInput: 'input#searchboxinput',
      directionsButton: '[aria-label*="Directions"]',
      resultCard: '[role="article"]',
    },
    plannerHints: [
      'Start with the search box, then use directions or place details once the target place is visible.',
      'Maps tasks often need an explicit zoom, route, or place selection step after search.',
    ],
    recoveryHints: [
      'If the place result is not visible, search by the exact place name or address again.',
      'Prefer the Maps search input over other page controls when recovering from ambiguity.',
    ],
    verificationHints: [
      'A maps task should end on the intended place, route, or directions panel.',
    ],
  },
  {
    id: 'amazon',
    name: 'Amazon',
    hostPatterns: [/^(?:www\.)?amazon\.[a-z.]+$/i],
    urlPatterns: [/amazon\./i],
    promptKeywords: ['amazon', 'buy', 'price', 'product', 'cart', 'order'],
    pageMarkers: [
      '#twotabsearchtextbox',
      '[data-component-type="s-search-result"]',
      '[aria-label*="Cart"]',
    ],
    selectorAliases: {
      searchInput: '#twotabsearchtextbox',
      resultCard: '[data-component-type="s-search-result"]',
      cartButton: '[aria-label*="Cart"]',
    },
    plannerHints: [
      'Search first, then open the best matching result before interacting with product details.',
      'Add-to-cart and checkout flows usually need a result page and a product detail page.',
    ],
    recoveryHints: [
      'If the exact item page is missing, search Amazon again with a tighter product query.',
      'Use the product list results rather than free-form page controls when recovering.',
    ],
    verificationHints: [
      'A successful shopping task should reach the expected product, cart, or checkout state.',
    ],
  },
  {
    id: 'facebook',
    name: 'Facebook',
    hostPatterns: [/^(?:www\.)?facebook\.com$/i, /^m\.facebook\.com$/i],
    urlPatterns: [/facebook\.com/i],
    promptKeywords: ['facebook', 'feed', 'post', 'profile', 'message', 'share'],
    pageMarkers: ['[role="feed"]', '[aria-label*="Create a post"]', '[data-pagelet]'],
    selectorAliases: {
      feed: '[role="feed"]',
      createPost: '[aria-label*="Create a post"]',
      searchInput: 'input[aria-label*="Search Facebook"]',
    },
    plannerHints: [
      'Use the feed or search field to locate the person, page, or post before interacting.',
      'Posting tasks often require opening the composer before entering text.',
    ],
    recoveryHints: [
      'If the feed is noisy, use search to find the exact profile or page first.',
      'Prefer stable accessible labels over visual-only controls when choosing actions.',
    ],
    verificationHints: [
      'Verify the target post, message, or profile action actually appears after execution.',
    ],
  },
  {
    id: 'instagram',
    name: 'Instagram',
    hostPatterns: [/^(?:www\.)?instagram\.com$/i],
    urlPatterns: [/instagram\.com/i],
    promptKeywords: ['instagram', 'reel', 'story', 'post', 'profile', 'dm'],
    pageMarkers: ['article', '[role="dialog"]', '[aria-label*="Search"]'],
    selectorAliases: {
      searchInput: 'input[aria-label*="Search"]',
      postCard: 'article',
      dialog: '[role="dialog"]',
    },
    plannerHints: [
      'Search or open a profile before interacting with posts, reels, or messages.',
      'Dialogs are common; wait for the page to settle before clicking inside overlays.',
    ],
    recoveryHints: [
      'If the target content is hidden, search the profile or hashtag again.',
      'Treat modal dialogs as a separate navigation step when recovery is needed.',
    ],
    verificationHints: [
      'Confirm the intended post, reel, profile, or message view opened before finishing.',
    ],
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    hostPatterns: [/^(?:www\.)?linkedin\.com$/i],
    urlPatterns: [/linkedin\.com/i],
    promptKeywords: ['linkedin', 'job', 'profile', 'message', 'connect', 'company'],
    pageMarkers: ['[data-test-id*="search"]', '.search-global-typeahead', '[role="main"]'],
    selectorAliases: {
      searchInput: '.search-global-typeahead input, [data-test-id*="search"] input',
      resultCard: '[role="main"]',
      connectButton: '[aria-label*="Connect"]',
    },
    plannerHints: [
      'Search for the person, company, or job before trying to connect or message.',
      'Many LinkedIn tasks require opening a profile or job detail page first.',
    ],
    recoveryHints: [
      'If the page is not showing the expected profile, search LinkedIn again with the full name or company.',
      'Prefer main content and visible profile controls over sidebar elements.',
    ],
    verificationHints: [
      'Verify the profile, job, or message target is visible before marking success.',
    ],
  },
  {
    id: 'reddit',
    name: 'Reddit',
    hostPatterns: [/^(?:www\.)?reddit\.com$/i],
    urlPatterns: [/reddit\.com/i],
    promptKeywords: ['reddit', 'subreddit', 'post', 'comment', 'upvote'],
    pageMarkers: [
      'shreddit-app',
      '[data-testid="post-container"]',
      '[aria-label*="Search Reddit"]',
    ],
    selectorAliases: {
      searchInput: '[aria-label*="Search Reddit"]',
      postCard: '[data-testid="post-container"]',
      commentsLink: 'a[href*="comments"]',
    },
    plannerHints: [
      'Search by subreddit or topic first, then open the most relevant post or comment thread.',
      'Reddit often needs a thread open before actions like commenting or voting make sense.',
    ],
    recoveryHints: [
      'If the target thread is not visible, search the subreddit or post title again.',
      'Use the post container as the stable target when recovering from layout shifts.',
    ],
    verificationHints: [
      'A Reddit task should end on the intended thread, post, or subreddit page.',
    ],
  },
  {
    id: 'x-twitter',
    name: 'X / Twitter',
    hostPatterns: [/^(?:www\.)?x\.com$/i, /^(?:www\.)?twitter\.com$/i],
    urlPatterns: [/x\.com/i, /twitter\.com/i],
    promptKeywords: ['x', 'twitter', 'tweet', 'post', 'reply', 'thread', 'retweet'],
    pageMarkers: ['[data-testid="tweet"]', '[aria-label*="Post text"]', '[aria-label*="Timeline"]'],
    selectorAliases: {
      searchInput: '[aria-label*="Search"]',
      tweetCard: '[data-testid="tweet"]',
      composeButton: '[aria-label*="Post text"]',
    },
    plannerHints: [
      'Search or open the timeline before trying to reply, post, or open a thread.',
      'Use tweet cards as the main unit when choosing a post to open.',
    ],
    recoveryHints: [
      'If the timeline is not obvious, use search or the profile page to find the target tweet.',
      'Do not treat a generic button click as success unless the tweet or thread is visible.',
    ],
    verificationHints: [
      'Confirm the expected tweet, thread, or posting surface is actually visible.',
    ],
  },
]

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_#.[\](){}>:+~*="'`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function keywordHits(text: string, keywords: string[]): number {
  const normalized = normalizeText(text)
  if (!normalized) return 0

  let hits = 0
  for (const keyword of keywords) {
    const pattern = new RegExp(`\\b${keyword.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i')
    if (pattern.test(normalized)) hits += 1
  }
  return hits
}

function readHostname(url: string): string | null {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

function readUrlText(url: string): string {
  try {
    return new URL(url).href
  } catch {
    return url
  }
}

function scorePlaybook(
  playbook: PlatformPlaybook,
  input: ResolvePlatformContextInput
): ResolvedPlatformMatch | null {
  const reasons: string[] = []
  let score = 0
  const matchedTabs = new Set<number>()
  const prompt = normalizeText(input.prompt)

  const promptHits = keywordHits(prompt, playbook.promptKeywords)
  if (promptHits > 0) {
    score += Math.min(30, promptHits * 8)
    reasons.push(`prompt matched ${promptHits} keyword${promptHits === 1 ? '' : 's'}`)
  }

  for (const tab of input.tabs) {
    const urlText = readUrlText(tab.url)
    const hostname = readHostname(tab.url)
    const tabReasons: string[] = []
    let tabScore = 0

    if (hostname && playbook.hostPatterns.some((pattern) => pattern.test(hostname))) {
      tabScore += 55
      tabReasons.push(`host matched ${hostname}`)
    }

    if (playbook.urlPatterns.some((pattern) => pattern.test(urlText))) {
      tabScore += 35
      tabReasons.push(`url matched ${urlText}`)
    }

    const titleText = normalizeText(tab.title)
    const markerHits = [
      ...playbook.pageMarkers,
      ...(playbook.selectorAliases ? Object.values(playbook.selectorAliases) : []),
    ].filter(
      (marker) =>
        marker &&
        (normalizeText(marker)
          ? titleText.includes(normalizeText(marker)) ||
            normalizeText(urlText).includes(normalizeText(marker))
          : false)
    ).length
    if (markerHits > 0) {
      tabScore += Math.min(20, markerHits * 5)
      tabReasons.push(`page markers matched ${markerHits}`)
    }

    if (tab.active && input.activeTabId != null && tab.id === input.activeTabId) {
      tabScore += 12
      tabReasons.push('active tab')
    }

    if (tabScore > 0) {
      score += tabScore
      matchedTabs.add(tab.id)
      reasons.push(`tab ${tab.id}: ${tabReasons.join(', ')}`)
    }
  }

  if (score === 0) return null

  return {
    playbook,
    score,
    reasons,
    matchedTabs: [...matchedTabs],
  }
}

export function resolvePlatformContext(
  input: ResolvePlatformContextInput
): ResolvedPlatformContext {
  const matches = PLATFORM_PLAYBOOKS.map((playbook) => scorePlaybook(playbook, input))
    .filter((match): match is ResolvedPlatformMatch => match != null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)

  return {
    primary: matches[0] ?? null,
    matches,
  }
}

function formatAliases(aliases: Record<string, string>): string {
  const entries = Object.entries(aliases)
  if (entries.length === 0) return '  (none)'
  return entries.map(([key, value]) => `  - ${key}: ${value}`).join('\n')
}

function formatBullets(items: string[]): string {
  if (items.length === 0) return '  (none)'
  return items.map((item) => `  - ${item}`).join('\n')
}

export function formatPlatformContextBlock(context: ResolvedPlatformContext): string {
  if (!context.primary) return ''

  const primary = context.primary
  const secondary = context.matches.slice(1)
  const sections = [
    `Primary platform: ${primary.playbook.name} (${primary.score})`,
    `Why selected: ${primary.reasons.join('; ')}`,
    'Selector aliases:',
    formatAliases(primary.playbook.selectorAliases),
    'Planner hints:',
    formatBullets(primary.playbook.plannerHints),
    'Recovery hints:',
    formatBullets(primary.playbook.recoveryHints),
    'Verification hints:',
    formatBullets(primary.playbook.verificationHints),
  ]

  if (secondary.length > 0) {
    sections.push(
      'Secondary platform candidates:',
      ...secondary.map((match) => `  - ${match.playbook.name} (${match.score})`)
    )
  }

  return ['Platform playbook context:', ...sections].join('\n')
}

export function listPlatformPlaybooks(): PlatformId[] {
  return PLATFORM_PLAYBOOKS.map((playbook) => playbook.id)
}

export { PLATFORM_PLAYBOOKS }
