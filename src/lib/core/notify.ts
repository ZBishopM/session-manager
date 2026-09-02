/**
 * Pure message-building for the weekly matchmaking notifications. The
 * hook (pb_hooks/weekly_matchmaker.pb.js) does the actual I/O — this
 * module only decides what the message text says, so it's testable
 * without touching $http or $os.
 */

import { formatHourRange, WEEKDAY_LABEL_ES, type Weekday } from "./matchmaking.js";

export interface InviteRecipient {
  nickname: string;
  /** Absolute URL to /invite/[token] for this recipient. */
  url: string;
}

export interface ProposalSummary {
  hostNickname: string;
  weekday: Weekday;
  startHour: number;
  endHour: number;
}

// Same alphabet/length convention as sessions.qr_token (src/lib/qr.ts),
// reimplemented here rather than imported: qr.ts also pulls in the
// `qrcode` npm package for SVG rendering, which doesn't run inside
// PocketBase's Goja JS runtime — this module has to stay hook-safe.
const TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TOKEN_LENGTH = 16;

export function generateInviteToken(random: () => number = Math.random): string {
  let token = "";
  for (let i = 0; i < TOKEN_LENGTH; i++) {
    token += TOKEN_ALPHABET[Math.floor(random() * TOKEN_ALPHABET.length)];
  }
  return token;
}

function whenText(proposal: ProposalSummary): string {
  return `${WEEKDAY_LABEL_ES[proposal.weekday]} ${formatHourRange(proposal.startHour, proposal.endHour)}`;
}

/**
 * One Discord message per proposal, posted to a shared channel — not a
 * per-player DM (Discord webhooks can't DM arbitrary users). Names the
 * whole invited group so it reads like an actual hangout proposal, with
 * each person's own accept/decline link.
 */
export function buildDiscordMessage(
  proposal: ProposalSummary,
  recipients: readonly InviteRecipient[],
): string {
  const lines = [
    `🎲 **${proposal.hostNickname}** puede hostear ${whenText(proposal)} — ¿juegan?`,
    ...recipients.map((r) => `• ${r.nickname}: ${r.url}`),
  ];
  return lines.join("\n");
}

/**
 * Per-recipient email, one message per player (unlike Discord's single
 * shared-channel post) since each invite link is personal.
 */
export interface EmailContent {
  subject: string;
  html: string;
}

export function buildInviteEmail(proposal: ProposalSummary, recipient: InviteRecipient): EmailContent {
  const when = whenText(proposal);
  return {
    subject: `${proposal.hostNickname} propone jugar ${when}`,
    html: [
      `<p>Hola ${recipient.nickname},</p>`,
      `<p><strong>${proposal.hostNickname}</strong> puede hostear ${when}. ¿Juegas?</p>`,
      `<p><a href="${recipient.url}">Responder a la invitación</a></p>`,
    ].join("\n"),
  };
}
