import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { pendingSecret, twoFactorState } from "@/lib/auth/two-factor";
import { otpauthUri } from "@/lib/auth/totp";
import { Banner, Card, fmtDate, inputCls, Submit } from "@/components/admin/ui";
import { TwoFactorConfirm } from "@/components/admin/two-factor-confirm";
import { confirmSetupAction, disableSetupAction, startSetupAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const me = await requireAdmin("staff");
  const sp = await searchParams;
  const db = await getDb();
  const state = await twoFactorState(db, me.id);
  const secret = state.pending ? await pendingSecret(db, me.id) : null;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-extrabold">Account security</h1>
      <p className="mt-1 text-sm text-muted">Two-step sign-in asks for a code from an authenticator app (Google Authenticator, Microsoft Authenticator, Authy, 1Password and similar) as well as your password. Customer phone numbers and addresses are behind this login, so we recommend it for everyone, especially owners.</p>
      <div className="mt-4"><Banner ok={sp.ok} error={sp.error} /></div>

      {!state.available && (
        <Card title="Not available yet" id="na">
          <p className="mt-2 text-sm">The server needs a secret key before this can be turned on, so the authenticator secrets can be stored encrypted. Ask whoever manages your hosting to add a setting named <code>TWO_FACTOR_KEY</code> (32 or more random characters) and restart the site. Nothing else changes until then.</p>
        </Card>
      )}

      {state.available && state.enabledAt && (
        <Card title="Two-step sign-in is on" id="on">
          <p className="mt-2 text-sm font-semibold text-ok">On since {fmtDate(state.enabledAt)}. {state.recoveryLeft} recovery {state.recoveryLeft === 1 ? "code" : "codes"} left.</p>
          {state.recoveryLeft <= 2 && <p role="alert" className="mt-2 text-sm font-semibold text-warn">You are running low on recovery codes. Turn two-step sign-in off and on again to get a fresh set.</p>}
          <form action={disableSetupAction} className="mt-4 space-y-3 border-t border-line pt-4">
            <h3 className="text-sm font-bold">Turn it off</h3>
            <div><label htmlFor="pw" className="text-sm font-semibold">Your password</label><input id="pw" name="password" type="password" required autoComplete="current-password" className={inputCls} /></div>
            <div><label htmlFor="cd" className="text-sm font-semibold">Current code from the app</label><input id="cd" name="code" required inputMode="numeric" autoComplete="one-time-code" maxLength={7} className={inputCls} /></div>
            <Submit danger>Turn off two-step sign-in</Submit>
          </form>
        </Card>
      )}

      {state.available && !state.enabledAt && !secret && (
        <Card title="Set up an authenticator app" id="setup">
          <p className="mt-2 text-sm text-muted">It takes about a minute. You will need your phone.</p>
          <form action={startSetupAction} className="mt-3"><Submit>Start setup</Submit></form>
        </Card>
      )}

      {state.available && !state.enabledAt && secret && (
        <Card title="Finish setting up" id="finish">
          <ol className="mt-2 list-decimal space-y-3 pl-5 text-sm">
            <li>
              On the phone you are using now, tap{" "}
              <a href={otpauthUri(secret, me.email)} className="font-semibold text-accent underline">Open in authenticator app</a>.
              {" "}On a computer, add a new account in your app and type this key (spaces do not matter):
              <p className="mt-2 break-all rounded-[var(--radius-sm)] bg-canvas p-3 font-mono text-base tracking-wider" data-testid="totp-secret">{secret.match(/.{1,4}/g)?.join(" ")}</p>
            </li>
            <li>Type the 6-digit code the app shows, to prove it is set up.</li>
          </ol>
          <TwoFactorConfirm action={confirmSetupAction} />
          <form action={startSetupAction} className="mt-4"><button className="min-h-11 text-sm font-semibold text-muted underline">Start over with a new key</button></form>
        </Card>
      )}
    </div>
  );
}
