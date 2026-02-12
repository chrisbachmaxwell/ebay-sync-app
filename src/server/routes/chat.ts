import { Router, type Request, type Response } from 'express';
import { info, error as logError } from '../../utils/logger.js';

const router = Router();

const PORT = parseInt(process.env.PORT || '3000', 10);

// ---------------------------------------------------------------------------
// Persistent container state (module-level, survives across chat messages)
// ---------------------------------------------------------------------------
let containerId: string | null = null;
let previousResponseId: string | null = null;

// ---------------------------------------------------------------------------
// System prompt for the Responses API + shell tool agent
// ---------------------------------------------------------------------------
const SHELL_SYSTEM_PROMPT = `You are an eBay Sync Assistant for a Shopify ↔ eBay integration app used by a camera store (UsedCameraGear.com / Pictureline).

You have access to a shell environment. You can run commands to help the user manage their product listings, orders, and sync operations.

## Internal API (running at http://localhost:${PORT})
You can use curl to hit these endpoints:
- GET  /api/status              — app sync status
- GET  /api/listings            — list eBay listings
- GET  /api/listings/stale      — show stale listings
- GET  /api/listings/health     — listing health report
- POST /api/listings/republish-stale — republish stale listings
- POST /api/listings/apply-price-drops — apply price drops
- GET  /api/mappings            — show category/field mappings
- PUT  /api/mappings/:category/:field_name — update a mapping
- POST /api/sync/products       — sync products (body: { "productIds": ["id1","id2"] })
- GET  /api/orders              — list orders
- GET  /api/settings            — show app settings

## Rules
- NEVER sync orders without a date filter. Do not call POST /api/sync/trigger without an explicit date range.
- NEVER delete production data.
- Be concise and friendly in your responses.
- When you run commands, summarize the results in plain language for the user.
- If something fails, explain the error clearly and suggest next steps.

## Available tools in the shell
- curl for API calls
- node / Node.js for data processing
- sqlite3 for direct database queries (the app uses SQLite via better-sqlite3)
- Standard Unix tools (jq, grep, awk, etc.)
`;

// ---------------------------------------------------------------------------
// Fallback system prompt for Chat Completions (gpt-4o-mini)
// ---------------------------------------------------------------------------
const FALLBACK_SYSTEM_PROMPT = `You are an eBay Sync Assistant for a Shopify ↔ eBay integration app used by a camera store. You help users manage their product listings, orders, and sync operations.

You have access to internal API endpoints. When the user asks you to do something, determine which API to call, call it, and report the results in a friendly way.

Available capabilities:
- "sync products" → POST /api/sync/products (requires { productIds: string[] } body — if user doesn't specify, explain this)
- "show status" / "check status" → GET /api/status
- "list products" / "show listings" → GET /api/listings
- "show mappings" → GET /api/mappings
- "update mapping" → PUT /api/mappings/:category/:field_name (body: { mapping_type, source_value, target_value })
- "show orders" / "list orders" → GET /api/orders
- "sync orders" → POST /api/sync/trigger
- "show settings" → GET /api/settings
- "show stale listings" → GET /api/listings/stale
- "show listing health" → GET /api/listings/health
- "republish stale listings" → POST /api/listings/republish-stale
- "apply price drops" → POST /api/listings/apply-price-drops

Respond with a JSON object (and ONLY a JSON object, no markdown fences):
{
  "intent": "the_action_name or chat",
  "api_calls": [
    { "method": "GET|POST|PUT", "path": "/api/...", "body": null }
  ],
  "message": "A friendly message to show the user (you'll fill in results after I provide them)"
}

If the user is just chatting or asking for help, set intent to "chat" and api_calls to an empty array.
If you need to call an API, include it in api_calls. I will execute the calls and send the results back for you to format.`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ResponsesApiResponse {
  id: string;
  object: string;
  status: string;
  output: ResponsesOutputItem[];
  error?: { message: string } | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

interface ResponsesOutputItem {
  type: string;
  // message items
  role?: string;
  content?: Array<{ type: string; text?: string }>;
  // shell_call items
  call_id?: string;
  action?: {
    commands?: string[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
  };
  // shell_call_output items
  output?: Array<{
    stdout?: string;
    stderr?: string;
    outcome?: { type: string; exit_code?: number };
  }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

interface ApiCall {
  method: string;
  path: string;
  body?: unknown;
}

interface AiParsedResponse {
  intent: string;
  api_calls: ApiCall[];
  message: string;
}

// ---------------------------------------------------------------------------
// Container management
// ---------------------------------------------------------------------------
async function getOrCreateContainer(apiKey: string): Promise<string> {
  if (containerId) return containerId;

  info('[Chat] Creating new OpenAI shell container...');
  const response = await fetch('https://api.openai.com/v1/containers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      name: 'ebay-sync-chat',
      expires_after: { anchor: 'last_active_at', minutes: 30 },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to create container (${response.status}): ${errText}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await response.json()) as any;
  containerId = data.id as string;
  info(`[Chat] Container created: ${containerId}`);
  return containerId!;
}

// ---------------------------------------------------------------------------
// Responses API call (GPT-5.2 + shell tool)
// ---------------------------------------------------------------------------
async function callResponsesApi(
  userMessage: string,
  apiKey: string,
): Promise<{ text: string; actions: Array<{ type: string; detail: string }> }> {
  const cId = await getOrCreateContainer(apiKey);

  // Build input — use previous_response_id for conversational continuity
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: Record<string, any> = {
    model: 'gpt-5.2',
    instructions: SHELL_SYSTEM_PROMPT,
    tools: [
      {
        type: 'shell',
        environment: {
          type: 'container_reference',
          container_id: cId,
        },
      },
    ],
    tool_choice: 'auto',
    input: userMessage,
  };

  if (previousResponseId) {
    body.previous_response_id = previousResponseId;
  }

  info(`[Chat] Calling Responses API (model: gpt-5.2, container: ${cId})`);
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    // If gpt-5.2 isn't available, the error will bubble up and we'll fallback
    throw new Error(`Responses API error (${response.status}): ${errText}`);
  }

  const data = (await response.json()) as ResponsesApiResponse;
  info(`[Chat] Responses API status: ${data.status}, output items: ${data.output?.length ?? 0}`);

  // Save response ID for conversational continuity
  previousResponseId = data.id;

  // Extract text and actions from output
  const actions: Array<{ type: string; detail: string }> = [];
  let finalText = '';

  for (const item of data.output || []) {
    if (item.type === 'message' && item.content) {
      for (const part of item.content) {
        if (part.type === 'output_text' && part.text) {
          finalText += part.text;
        }
      }
    } else if (item.type === 'shell_call') {
      const cmds = item.action?.commands?.join('; ') || 'shell command';
      actions.push({ type: 'shell', detail: cmds });
    } else if (item.type === 'shell_call_output') {
      for (const out of item.output || []) {
        const exitCode = out.outcome?.exit_code ?? '?';
        actions.push({
          type: exitCode === 0 ? 'success' : 'error',
          detail: `exit ${exitCode}`,
        });
      }
    }
  }

  if (!finalText && data.status === 'completed') {
    finalText = 'Done — the operation completed but produced no text output.';
  }

  if (data.error) {
    throw new Error(`Responses API returned error: ${data.error.message}`);
  }

  return { text: finalText, actions };
}

// ---------------------------------------------------------------------------
// Fallback: Chat Completions API (gpt-4o-mini) — existing 2-pass flow
// ---------------------------------------------------------------------------
async function callChatCompletions(
  messages: Array<{ role: string; content: string }>,
  apiKey: string,
): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.3,
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errText}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await response.json()) as any;
  return data.choices?.[0]?.message?.content || '';
}

async function callInternalApi(apiCall: ApiCall): Promise<{ status: number; data: unknown }> {
  const url = `http://localhost:${PORT}${apiCall.path}`;
  const options: RequestInit = {
    method: apiCall.method,
    headers: { 'Content-Type': 'application/json' },
  };

  if (apiCall.body && apiCall.method !== 'GET') {
    options.body = JSON.stringify(apiCall.body);
  }

  const response = await fetch(url, options);
  const data = await response.json();
  return { status: response.status, data };
}

async function handleFallbackChat(
  message: string,
  apiKey: string,
): Promise<{ response: string; actions: Array<{ type: string; detail: string }> }> {
  info('[Chat] Using fallback Chat Completions (gpt-4o-mini)');

  const parseMessages = [
    { role: 'system', content: FALLBACK_SYSTEM_PROMPT },
    { role: 'user', content: message },
  ];

  const aiRaw = await callChatCompletions(parseMessages, apiKey);
  info(`[Chat] AI parse response: ${aiRaw.substring(0, 200)}`);

  let parsed: AiParsedResponse;
  try {
    const cleaned = aiRaw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return { response: aiRaw, actions: [] };
  }

  const actions: Array<{ type: string; detail: string }> = [];
  const apiResults: Array<{ path: string; status: number; data: unknown }> = [];

  if (parsed.api_calls && parsed.api_calls.length > 0) {
    for (const call of parsed.api_calls) {
      try {
        info(`[Chat] Calling internal API: ${call.method} ${call.path}`);
        const result = await callInternalApi(call);
        apiResults.push({ path: call.path, status: result.status, data: result.data });
        actions.push({
          type: result.status < 400 ? 'success' : 'error',
          detail: `${call.method} ${call.path} → ${result.status}`,
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        apiResults.push({ path: call.path, status: 500, data: { error: errMsg } });
        actions.push({ type: 'error', detail: `${call.method} ${call.path} failed: ${errMsg}` });
      }
    }

    const followUpMessages = [
      { role: 'system', content: FALLBACK_SYSTEM_PROMPT },
      { role: 'user', content: message },
      { role: 'assistant', content: aiRaw },
      {
        role: 'user',
        content: `Here are the API results. Please provide a friendly, concise summary for the user. Respond with plain text (not JSON).\n\n${JSON.stringify(apiResults, null, 2)}`,
      },
    ];

    const summary = await callChatCompletions(followUpMessages, apiKey);
    info(`[Chat] AI summary: ${summary.substring(0, 200)}`);
    return { response: summary, actions };
  }

  return { response: parsed.message || aiRaw, actions };
}

// ---------------------------------------------------------------------------
// POST /api/chat — AI-powered chat endpoint
// ---------------------------------------------------------------------------
router.post('/api/chat', async (req: Request, res: Response) => {
  try {
    const { message } = req.body as { message?: string };

    if (!message || typeof message !== 'string' || !message.trim()) {
      res.status(400).json({ error: 'message is required' });
      return;
    }

    info(`[Chat] User message: ${message}`);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.status(500).json({
        response:
          '⚠️ The AI assistant is not configured yet. Please set the OPENAI_API_KEY environment variable.',
        actions: [],
      });
      return;
    }

    // --- Primary path: Responses API + Shell tool (GPT-5.2) ---
    try {
      const result = await callResponsesApi(message, apiKey);
      info(`[Chat] Responses API success — text length: ${result.text.length}, actions: ${result.actions.length}`);
      res.json({ response: result.text, actions: result.actions });
      return;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logError(`[Chat] Responses API failed, falling back to Chat Completions: ${errMsg}`);

      // Reset container state on failure so we retry fresh next time
      containerId = null;
      previousResponseId = null;
    }

    // --- Fallback: Chat Completions (gpt-4o-mini) ---
    const fallbackResult = await handleFallbackChat(message, apiKey);
    res.json(fallbackResult);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logError(`[Chat] Error: ${errMsg}`);

    if (errMsg.includes('OPENAI_API_KEY')) {
      res.status(500).json({
        response:
          '⚠️ The AI assistant is not configured yet. Please set the OPENAI_API_KEY environment variable.',
        actions: [],
      });
      return;
    }

    res.status(500).json({
      response: `❌ Something went wrong: ${errMsg}`,
      actions: [],
    });
  }
});

export default router;
