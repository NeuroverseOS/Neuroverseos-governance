// Bevia — Intent Parsing System
//
// Three levels of intent:
// 1. Stated intent — what the user SAYS they want (dropdown selection)
// 2. Behavioral intent — what their MESSAGE reveals they want (signal analysis)
// 3. Pattern intent — what their HISTORY shows they consistently want (accumulated data)
//
// The product's most honest moment: "You said you want X, but your behavior
// suggests Y. Both are valid. Here's what each looks like."

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Intent Definitions Per Tool ─────────────────────────────────────────────

export type ToolId = 'tonecheck' | 'audit' | 'perspectives' | 'replay' | 'consensus' | 'signal';

export interface IntentOption {
  id: string;
  label: string;           // what the user sees
  description: string;     // tooltip / helper text
  behavioral_markers: string[]; // signals that suggest this intent even if not selected
  anti_markers: string[];  // signals that contradict this intent
}

export const TOOL_INTENTS: Record<ToolId, IntentOption[]> = {
  tonecheck: [
    {
      id: 'be_clear',
      label: 'Be clear',
      description: 'Make sure your message is understood exactly as intended',
      behavioral_markers: ['direct language', 'short sentences', 'specific requests', 'no hedging'],
      anti_markers: ['hedging', 'softeners', 'qualifiers', 'passive voice', 'maybe', 'just', 'I was thinking'],
    },
    {
      id: 'be_respectful',
      label: 'Show respect',
      description: 'Make sure the other person feels valued and heard',
      behavioral_markers: ['please', 'thank you', 'I appreciate', 'acknowledging their work'],
      anti_markers: ['demands', 'no greeting', 'terse', 'imperative mood'],
    },
    {
      id: 'avoid_conflict',
      label: 'Keep the peace',
      description: "Get your point across without creating friction",
      behavioral_markers: ['softeners', 'hedging', 'questions instead of statements', 'offering alternatives'],
      anti_markers: ['accusations', 'absolutes', 'you always', 'you never', 'direct criticism'],
    },
    {
      id: 'show_authority',
      label: 'Lead the conversation',
      description: 'Set direction and establish your position clearly',
      behavioral_markers: ['decisive language', 'I recommend', 'here is what we will do', 'action items'],
      anti_markers: ['asking permission', 'hedging', 'what do you think', 'if that works for you'],
    },
    {
      id: 'build_trust',
      label: 'Build the relationship',
      description: 'Strengthen the connection, even if the topic is hard',
      behavioral_markers: ['vulnerability', 'acknowledging feelings', 'I understand', 'shared language'],
      anti_markers: ['transactional tone', 'all business', 'no personal acknowledgment'],
    },
    {
      id: 'deliver_hard_news',
      label: 'Deliver difficult feedback',
      description: "Say something hard without destroying the relationship",
      behavioral_markers: ['direct but kind', 'specific examples', 'focus on behavior not character'],
      anti_markers: ['vague', 'burying the lead', 'sandwiching so much the point is lost'],
    },
  ],

  audit: [
    {
      id: 'check_alignment',
      label: 'Check alignment',
      description: 'Does this match our stated strategy and culture?',
      behavioral_markers: [],
      anti_markers: [],
    },
    {
      id: 'find_risks',
      label: 'Find risks',
      description: 'What could go wrong if we adopt this?',
      behavioral_markers: [],
      anti_markers: [],
    },
    {
      id: 'build_case',
      label: 'Build my case',
      description: 'Help me argue for/against this proposal with evidence',
      behavioral_markers: [],
      anti_markers: [],
    },
    {
      id: 'improve_proposal',
      label: 'Improve this',
      description: 'Make this document stronger and more aligned',
      behavioral_markers: [],
      anti_markers: [],
    },
  ],

  perspectives: [
    {
      id: 'make_decision',
      label: 'Help me decide',
      description: "I'm stuck between options and need perspective",
      behavioral_markers: ['should I', 'or', 'torn between', 'not sure whether'],
      anti_markers: [],
    },
    {
      id: 'understand_situation',
      label: 'Help me understand',
      description: "I want to see this from angles I haven't considered",
      behavioral_markers: ['why', 'what am I missing', 'how do I think about'],
      anti_markers: [],
    },
    {
      id: 'find_peace',
      label: 'Find peace with this',
      description: "I know what happened, I need to process it",
      behavioral_markers: ['happened', 'dealing with', 'struggling', 'can not change'],
      anti_markers: [],
    },
    {
      id: 'challenge_myself',
      label: 'Challenge my thinking',
      description: "Push back on my assumptions — I might be wrong",
      behavioral_markers: ['I think', 'I believe', 'am I right', 'tell me if'],
      anti_markers: [],
    },
  ],

  replay: [
    {
      id: 'understand_what_happened',
      label: 'What happened?',
      description: 'Break down what actually went on in this conversation',
      behavioral_markers: [],
      anti_markers: [],
    },
    {
      id: 'improve_next_time',
      label: 'Do better next time',
      description: 'Learn from this so the next conversation goes differently',
      behavioral_markers: [],
      anti_markers: [],
    },
    {
      id: 'repair_relationship',
      label: 'Fix this relationship',
      description: 'Understand what went wrong and how to rebuild',
      behavioral_markers: [],
      anti_markers: [],
    },
    {
      id: 'validate_my_read',
      label: 'Am I reading this right?',
      description: "Check if your interpretation of the conversation is accurate",
      behavioral_markers: [],
      anti_markers: [],
    },
  ],

  consensus: [
    {
      id: 'find_fair_solution',
      label: 'Be fair to everyone',
      description: 'Find a solution that works for the whole group',
      behavioral_markers: [],
      anti_markers: [],
    },
    {
      id: 'move_fast',
      label: 'Just decide',
      description: 'Speed matters more than perfection here',
      behavioral_markers: [],
      anti_markers: [],
    },
    {
      id: 'minimize_conflict',
      label: 'Avoid drama',
      description: 'Find the path of least resistance',
      behavioral_markers: [],
      anti_markers: [],
    },
  ],

  signal: [
    {
      id: 'find_collaborators',
      label: 'Find people to work with',
      description: 'People who complement your skills and share your values',
      behavioral_markers: [],
      anti_markers: [],
    },
    {
      id: 'find_mentors',
      label: 'Find people to learn from',
      description: 'People who are where you want to be',
      behavioral_markers: [],
      anti_markers: [],
    },
    {
      id: 'find_community',
      label: 'Find my people',
      description: 'People who think like you and get you',
      behavioral_markers: [],
      anti_markers: [],
    },
  ],
};

// ─── Smart Defaults ──────────────────────────────────────────────────────────
// If user doesn't select intent, infer it from context.

export const DEFAULT_INTENTS: Record<ToolId, string> = {
  tonecheck: 'be_clear',
  audit: 'check_alignment',
  perspectives: 'make_decision',
  replay: 'understand_what_happened',
  consensus: 'find_fair_solution',
  signal: 'find_collaborators',
};

// ─── Intent Detection (behavioral) ──────────────────────────────────────────
// Compares the user's stated intent against behavioral signals in their input.
// Surfaces the gap when stated ≠ behavioral.

export interface IntentAnalysis {
  statedIntent: string;
  behavioralIntent: string | null;  // null if no gap detected
  confidence: number;               // 0-1 how confident we are in the gap
  gap: string | null;               // human-readable description of the gap
  signals: string[];                // what behavioral markers we detected
}

export function analyzeIntent(
  statedIntentId: string,
  inputText: string,
  tool: ToolId,
): IntentAnalysis {
  const intents = TOOL_INTENTS[tool];
  const stated = intents.find(i => i.id === statedIntentId);

  if (!stated) {
    return {
      statedIntent: statedIntentId,
      behavioralIntent: null,
      confidence: 0,
      gap: null,
      signals: [],
    };
  }

  const textLower = inputText.toLowerCase();
  const detectedSignals: string[] = [];

  // Check for anti-markers of stated intent (signals that contradict what they said they want)
  const antiHits: string[] = [];
  for (const marker of stated.anti_markers) {
    if (textLower.includes(marker.toLowerCase())) {
      antiHits.push(marker);
      detectedSignals.push(`Contains "${marker}" — contradicts "${stated.label}" intent`);
    }
  }

  // Check for positive markers of OTHER intents
  let bestAlternative: { id: string; label: string; score: number } | null = null;

  for (const intent of intents) {
    if (intent.id === statedIntentId) continue;

    let score = 0;
    for (const marker of intent.behavioral_markers) {
      if (textLower.includes(marker.toLowerCase())) {
        score++;
        detectedSignals.push(`Contains "${marker}" — suggests "${intent.label}" intent`);
      }
    }

    if (score > 0 && (!bestAlternative || score > bestAlternative.score)) {
      bestAlternative = { id: intent.id, label: intent.label, score };
    }
  }

  // Determine if there's a meaningful gap
  const hasAntiSignals = antiHits.length >= 2;
  const hasAlternative = bestAlternative && bestAlternative.score >= 2;

  if (hasAntiSignals && hasAlternative) {
    return {
      statedIntent: statedIntentId,
      behavioralIntent: bestAlternative!.id,
      confidence: Math.min(0.9, (antiHits.length + bestAlternative!.score) / 8),
      gap: `You selected "${stated.label}" but your message shows signs of "${bestAlternative!.label}" — ` +
           `it contains ${antiHits.map(h => `"${h}"`).join(', ')} which typically work against ${stated.label.toLowerCase()}. ` +
           `Both intents are valid. Which matters more right now?`,
      signals: detectedSignals,
    };
  }

  if (hasAntiSignals) {
    return {
      statedIntent: statedIntentId,
      behavioralIntent: null,
      confidence: Math.min(0.7, antiHits.length / 4),
      gap: `Your message contains ${antiHits.map(h => `"${h}"`).join(', ')} — ` +
           `these tend to work against "${stated.label.toLowerCase()}." ` +
           `This might be intentional, or it might be a habit worth noticing.`,
      signals: detectedSignals,
    };
  }

  // No gap detected
  return {
    statedIntent: statedIntentId,
    behavioralIntent: null,
    confidence: 0,
    gap: null,
    signals: detectedSignals,
  };
}

// ─── Pattern Intent (from history) ───────────────────────────────────────────
// Looks at past intent selections and behavioral patterns to surface
// recurring gaps. Called when enough data has accumulated (10+ interactions).

export async function getPatternIntent(
  supabase: SupabaseClient,
  userId: string,
  tool: ToolId,
): Promise<{ pattern: string | null; dataPoints: number }> {
  const { data: actions } = await supabase
    .from('bevia_user_actions')
    .select('metadata')
    .eq('user_id', userId)
    .eq('tool', tool)
    .order('created_at', { ascending: false })
    .limit(50);

  if (!actions || actions.length < 10) {
    return { pattern: null, dataPoints: actions?.length || 0 };
  }

  // Count stated vs behavioral intent gaps
  const gaps: Record<string, number> = {};
  let totalWithGap = 0;

  for (const action of actions) {
    const meta = action.metadata as Record<string, unknown>;
    if (meta?.intentGap && meta?.statedIntent && meta?.behavioralIntent) {
      const key = `${meta.statedIntent}→${meta.behavioralIntent}`;
      gaps[key] = (gaps[key] || 0) + 1;
      totalWithGap++;
    }
  }

  if (totalWithGap < 3) {
    return { pattern: null, dataPoints: actions.length };
  }

  // Find the most common gap
  const topGap = Object.entries(gaps).sort((a, b) => b[1] - a[1])[0];
  if (topGap && topGap[1] >= 3) {
    const [from, to] = topGap[0].split('→');
    const fromLabel = TOOL_INTENTS[tool]?.find(i => i.id === from)?.label || from;
    const toLabel = TOOL_INTENTS[tool]?.find(i => i.id === to)?.label || to;

    return {
      pattern: `Across ${actions.length} interactions, you select "${fromLabel}" but your behavior ` +
               `consistently trends toward "${toLabel}" (${topGap[1]} times). ` +
               `This isn't a problem — it's information. Your real priority might be ${toLabel.toLowerCase()}.`,
      dataPoints: actions.length,
    };
  }

  return { pattern: null, dataPoints: actions.length };
}

// ─── Build Intent-Aware Prompt Addition ──────────────────────────────────────
// Appended to any AI prompt to make the output intent-aware.

export function buildIntentPromptAddition(analysis: IntentAnalysis, patternIntent?: string | null): string {
  let addition = `\nUSER'S STATED INTENT: "${analysis.statedIntent}"\n`;
  addition += `Frame your entire response relative to this goal. Every observation should connect back to whether it serves or undermines this intent.\n`;

  if (analysis.gap) {
    addition += `\nINTENT GAP DETECTED:\n${analysis.gap}\n`;
    addition += `Address this gap in your response. Don't judge it — surface it. Present both intents as valid options with different tradeoffs. Frame as: "If your goal is truly X, then... But if Y matters more right now, then..."\n`;
  }

  if (patternIntent) {
    addition += `\nPATTERN INSIGHT (from user history):\n${patternIntent}\n`;
    addition += `Mention this pattern if it's relevant to the current situation. Frame as awareness, not criticism.\n`;
  }

  addition += `\nGOVERNANCE REMINDERS:\n`;
  addition += `- Present options, not scripts (guard-013)\n`;
  addition += `- "Based on patterns" not "this will happen" (guard-015)\n`;
  addition += `- The user chooses — present tradeoffs, not optimal paths (guard-016)\n`;

  return addition;
}
