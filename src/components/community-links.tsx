import { getText } from "@/server/settings";

/** Homepage: join the managers community / WhatsApp channel. Each button only shows once admins set its link. */
export async function CommunityLinks() {
  const [community, whatsapp] = await Promise.all([getText("facebookGroupUrl"), getText("whatsappChannelUrl")]);
  if (!community && !whatsapp) return null;
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-ink-700 bg-ink-900 p-5 sm:flex-row sm:items-center sm:p-6">
      <div className="min-w-0 flex-1">
        <p className="eyebrow text-lime">Managers community</p>
        <h2 className="mt-1 text-3xl">Join the managers community</h2>
        <p className="mt-1 text-sm text-muted">Talk tactics, show off your pulls, and be first to hear about new drops, freerolls and prizes.</p>
      </div>
      <div className="flex flex-col gap-2 sm:w-64">
        {community && (
          <a href={community} target="_blank" rel="noreferrer" className="btn-primary w-full">
            Join the community
          </a>
        )}
        {whatsapp && (
          <a href={whatsapp} target="_blank" rel="noreferrer" className="btn w-full bg-[#25D366] text-[#062b14] hover:brightness-110">
            Join our WhatsApp channel
          </a>
        )}
      </div>
    </section>
  );
}
