import { revalueAction, runJobsAction } from "@/app/actions/admin";
import { ActionButton } from "@/components/action-button";
import { SettingForm } from "@/components/admin-forms";
import { SETTINGS, type SettingKey, allSettings } from "@/server/settings";
import { OpsSections } from "../_parts/ops";
import { AdminTitle } from "../_parts/title";

export const metadata = { title: "Admin · Settings" };

export default async function SettingsPage() {
  const values = await allSettings();
  return (
    <>
      <AdminTitle title="Settings & flags" intro="Game settings, feature switches (pack shop, transfers, auctions, beta…) and the audit log.">
        <ActionButton action={runJobsAction}>Run scheduled jobs</ActionButton>
        <ActionButton action={revalueAction}>Revalue MX</ActionButton>
      </AdminTitle>
      <section className="panel space-y-4 p-5">
        <h2 className="text-2xl">Game settings</h2>
        {(Object.keys(SETTINGS) as SettingKey[]).map((k) => (
          <SettingForm key={k} settingKey={k} label={SETTINGS[k].label} help={SETTINGS[k].help} value={values[k]} min={SETTINGS[k].min} max={SETTINGS[k].max} />
        ))}
      </section>
      <OpsSections only={["flags", "audit"]} />
    </>
  );
}
