/// <reference path="../pb_data/types.d.ts" />
/**
 * Any logged-in player can propose an achievement (createRule on
 * "achievements" is open), but nobody can self-approve one: this hook
 * force-overwrites status/proposed_by server-side on every API create
 * request, regardless of what the client submitted. Only a superuser
 * flipping status to "approved" via the admin dashboard makes it count
 * (pb_hooks/match_finished.pb.js only reads status: "approved" ones).
 *
 * Doesn't fire for game_created.pb.js's own $app.save() calls — this
 * hook only runs on real API create requests, not server-side saves.
 * Superuser requests (migrations, admin tooling, tests) skip the forced
 * fields entirely — they can set status/proposed_by deliberately.
 */
onRecordCreateRequest((e) => {
  if (e.hasSuperuserAuth()) {
    return e.next();
  }
  e.record.set("status", "pending");
  e.record.set("proposed_by", e.auth.id);
  e.next();
}, "achievements");
