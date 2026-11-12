import { revalueAction, runJobsAction } from "@/app/actions/admin";
import { ActionButton } from "@/components/action-button";
import { SettingForm, TextSettingForm } from "@/components/admin-forms";
import { SETTINGS, type SettingKey, TEXT_SETTINGS, allSettings, getText } from "@/server/settings";
import { giftPacks } from "@/server/welcome";
import { OpsSections } from "../_parts/ops";
import { AdminTitle } from "../_parts/title";

export const metadata = { title: "Admin · Settings" };

export default async function SettingsPage() {
  const [values, fbGroup, whatsapp, referral, hero, monthly, milestones] = await Promise.all([allSettings(), getText("facebookGroupUrl"), getText("whatsappChannelUrl"), getText("referralRewardSku"), getText("homeHeroImage"), getText("referralMonthlyPrizeSku"), getText("referralMilestones")]);
  return (
    <>
      <AdminTitle title="Settings & flags" intro="Game settings, feature switches (pack shop, transfers, auctions, beta…) and the audit log.">
        <ActionButton action={runJobsAction}>Run scheduled jobs</ActionButton>
        <ActionButton action={revalueAction}>Revalue players</ActionButton>
      </AdminTitle>
      <section className="panel space-y-4 p-5">
        <h2 className="text-2xl">Game settings</h2>
        {(Object.keys(SETTINGS) as SettingKey[]).filter((k) => k !== "cashAnyCards").map((k) => (
          <SettingForm key={k} settingKey={k} label={SETTINGS[k].label} help={SETTINGS[k].help} value={values[k]} min={SETTINGS[k].min} max={SETTINGS[k].max} />
        ))}
        <TextSettingForm settingKey="referralRewardSku" label={TEXT_SETTINGS.referralRewardSku.label} help={TEXT_SETTINGS.referralRewardSku.help} value={referral} options={giftPacks()} />
        <TextSettingForm settingKey="referralMonthlyPrizeSku" label={TEXT_SETTINGS.referralMonthlyPrizeSku.label} help={TEXT_SETTINGS.referralMonthlyPrizeSku.help} value={monthly} options={giftPacks()} />
        <TextSettingForm settingKey="referralMilestones" label={TEXT_SETTINGS.referralMilestones.label} help={TEXT_SETTINGS.referralMilestones.help} value={milestones} placeholder="1=football-eng-bronze, 5=football-eng-silver, 20=football-eng-gold, 100=football-eng-rare" />
      </section>
      <section className="panel space-y-4 p-5">
        <h2 className="text-2xl">Homepage</h2>
        <TextSettingForm settingKey="homeHeroImage" label={TEXT_SETTINGS.homeHeroImage.label} help={TEXT_SETTINGS.homeHeroImage.help} value={hero} placeholder="https://images.unsplash.com/photo-…?w=2000" />
      </section>
      <section className="panel space-y-4 p-5">
        <h2 className="text-2xl">Community links</h2>
        <p className="text-sm text-muted">Where the homepage&apos;s &quot;Join the managers community&quot; buttons go. Each one only shows once its link is set.</p>
        <TextSettingForm settingKey="facebookGroupUrl" label={TEXT_SETTINGS.facebookGroupUrl.label} help={TEXT_SETTINGS.facebookGroupUrl.help} value={fbGroup} />
        <TextSettingForm settingKey="whatsappChannelUrl" label={TEXT_SETTINGS.whatsappChannelUrl.label} help={TEXT_SETTINGS.whatsappChannelUrl.help} value={whatsapp} />
      </section>
      <OpsSections only={["flags", "audit"]} />
    </>
  );
}
