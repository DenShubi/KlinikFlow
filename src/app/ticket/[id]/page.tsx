import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";

import { Brand } from "@/components/brand";
import { AlertIcon, BellIcon, CheckIcon, ClockIcon, DoorIcon, UsersIcon } from "@/components/icons";
import { CopyLinkButton } from "@/components/queue/copy-link-button";
import { TicketLive } from "@/components/queue/ticket-live";
import { PrintLabel, Ticket } from "@/components/ticket";
import { clinicToday, formatClinicDate, formatClinicTime, minutesUntil } from "@/lib/clinic-time";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { getDictionary, getLocale } from "@/lib/i18n/server";
import { isUuid, queueTopic, type TicketPublicStatus } from "@/lib/queue/public-status";
import { ABSENT_AFTER_MINUTES, MAX_DEFERS, REJOIN_OFFSET } from "@/lib/queue/rules";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.meta.ticket, robots: { index: false, follow: false } };
}

// Arrive this many minutes before the estimated call time.
const ARRIVE_EARLY_MINUTES = 15;

type Status = TicketPublicStatus["status"];

const CHIP: Record<Status, string> = {
  waiting: "bg-tint text-accent-strong",
  called: "bg-accent text-white",
  in_consultation: "bg-ink text-white",
  done: "bg-ok-soft text-ok",
  cancelled: "bg-danger-soft text-danger",
  no_show: "bg-danger-soft text-danger",
};

type Ctx = { t: Dictionary; locale: Locale };

// The patient's own ticket, reached through the link they got after
// registering (the ticket id is the secret). No login.
export default async function TicketPage(props: PageProps<"/ticket/[id]">) {
  const { id } = await props.params;
  if (!isUuid(id)) notFound();
  await connection(); // live data and "minutes left" are per request

  const supabase = await createClient();
  const { data } = await supabase.rpc("ticket_public_status", { p_ticket_id: id });
  if (!data) notFound();
  const t = data as unknown as TicketPublicStatus;
  const locale = await getLocale();
  const dict = await getDictionary();
  const ctx: Ctx = { t: dict, locale };
  const chip =
    t.missed_turn && t.status === "waiting"
      ? { text: dict.ticket.missedChip, cls: "bg-warn-soft text-warn" }
      : { text: dict.ticket.status[t.status], cls: CHIP[t.status] };
  const closed = t.status === "done" || t.status === "cancelled" || t.status === "no_show";

  return (
    <div className="flex flex-1 flex-col">
      <TicketLive topic={queueTopic(t.doctor_id, t.service_date)} />

      <header className="mx-auto flex w-full max-w-[440px] items-center justify-center px-4 pt-4">
        <Brand />
      </header>

      <main className="mx-auto flex w-full max-w-[440px] flex-1 flex-col gap-5 px-4 pb-12 pt-5">
        <Ticket
          label={dict.ticket.ticketLabel(t.ticket_code)}
          className="enter-rise"
          stubTone={t.status === "called" ? "accent" : "plain"}
          stub={<Stub t={t} ctx={ctx} />}
        >
          <div className={`flex flex-col gap-6 px-6 pb-7 pt-6 ${closed ? "opacity-70" : ""}`}>
            <div className="flex items-center justify-between gap-3">
              <PrintLabel>{formatClinicDate(t.service_date, locale)}</PrintLabel>
              <span role="status" className={`rounded-full px-2.5 py-1 text-xs font-semibold ${chip.cls}`}>
                {chip.text}
              </span>
            </div>

            <div>
              <PrintLabel>{dict.ticket.queueNumber}</PrintLabel>
              <p className="mt-2 text-[80px] font-extrabold leading-[0.9] tracking-[-0.05em] tabular-nums sm:text-[88px]">
                {t.ticket_code}
              </p>
              <p className="mt-3 text-[17px] font-semibold">{t.patient_short_name}</p>
            </div>

            <dl className="grid grid-cols-2 gap-4 border-t border-line-soft pt-5 text-sm">
              <div>
                <dt className="text-xs text-muted">{dict.ticket.doctor}</dt>
                <dd className="mt-0.5 font-semibold">{t.doctor_name}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">{dict.ticket.room}</dt>
                <dd className="mt-0.5 font-semibold">{t.room ?? "–"}</dd>
              </div>
            </dl>
          </div>
        </Ticket>

        {closed ? null : (
          <div className="flex flex-col gap-2.5">
            <CopyLinkButton />
            <p className="text-center text-xs text-muted">{dict.ticket.saveLink}</p>
          </div>
        )}
      </main>
    </div>
  );
}

function Stub({ t, ctx }: { t: TicketPublicStatus; ctx: Ctx }) {
  const d = ctx.t.ticket;
  switch (t.status) {
    case "called":
      return (
        <div className="flex flex-col gap-1 px-6 pb-7 pt-7" role="alert">
          <p className="flex items-center gap-2 text-[26px] font-extrabold tracking-[-0.03em]">
            <BellIcon size={24} strokeWidth={2} />
            {d.yourTurn}
          </p>
          <p className="text-[17px] text-white/90">
            {d.goTo} <strong className="font-bold text-white">{t.room ?? d.consultRoom}</strong>.
          </p>
          <p className="mt-1 text-sm text-white/80">
            {d.enterWithin(ABSENT_AFTER_MINUTES, REJOIN_OFFSET)}
          </p>
        </div>
      );
    case "in_consultation":
      return <StubMessage title={d.inConsultation} text={d.withDoctor(t.doctor_name)} />;
    case "done":
      return <StubMessage icon={<CheckIcon size={20} />} title={d.done} text={d.doneText} />;
    case "cancelled":
      return <StubMessage title={d.cancelled} text={d.cancelledText} />;
    case "no_show":
      return <StubMessage title={d.noShow} text={d.noShowText} />;
    case "waiting":
      return <WaitingStub t={t} ctx={ctx} />;
  }
}

function StubMessage({ title, text, icon }: { title: string; text: string; icon?: ReactNode }) {
  return (
    <div className="px-6 pb-7 pt-7">
      <p className="flex items-center gap-2 text-lg font-bold">
        {icon}
        {title}
      </p>
      <p className="mt-1 text-muted">{text}</p>
    </div>
  );
}

function WaitingStub({ t, ctx }: { t: TicketPublicStatus; ctx: Ctx }) {
  const d = ctx.t.ticket;
  const { locale } = ctx;
  if (t.missed_turn) {
    return (
      <div className="flex flex-col gap-3 px-6 pb-7 pt-7">
        <p className="flex items-center gap-2 text-lg font-bold text-warn">
          <AlertIcon size={20} />
          {d.missed}
        </p>
        <p className="text-[15px] leading-relaxed">
          {d.missedText} <strong className="tabular-nums">{d.patients(t.rejoin_offset)}</strong>.
        </p>
      </div>
    );
  }

  const isFutureDate = t.service_date > clinicToday();
  const minutes = isFutureDate ? null : minutesUntil(t.estimated_call_at);
  const arriveBy = t.estimated_call_at
    ? new Date(Date.parse(t.estimated_call_at) - ARRIVE_EARLY_MINUTES * 60000).toISOString()
    : null;

  return (
    <div className="flex flex-col gap-5 px-6 pb-6 pt-7">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <ClockIcon size={14} /> {d.calledAround}
          </p>
          <p className="mt-1 text-[28px] font-bold leading-none tracking-[-0.03em] tabular-nums">
            {formatClinicTime(t.estimated_call_at, locale)}
          </p>
          <p className="mt-1.5 text-[13px] text-muted">
            {isFutureDate
              ? formatClinicDate(t.service_date, locale)
              : minutes === null
                ? ""
                : minutes <= 1
                  ? d.soon
                  : d.minutesLeft(minutes)}
          </p>
        </div>
        <div>
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <UsersIcon size={14} /> {d.ahead}
          </p>
          <p className="mt-1 text-[28px] font-bold leading-none tracking-[-0.03em] tabular-nums">{t.people_ahead}</p>
          <p className="mt-1.5 text-[13px] text-muted">{d.peopleUnit(t.people_ahead)}</p>
        </div>
      </div>

      {t.now_serving ? (
        <div className="flex items-center justify-between rounded-[10px] bg-ink px-4 py-3 text-white">
          <span className="flex items-center gap-2 text-sm text-white/80">
            <DoorIcon size={16} /> {d.nowServing}
          </span>
          <span className="font-mono text-lg font-semibold tabular-nums">{t.now_serving}</span>
        </div>
      ) : null}

      {t.defer_count > 0 ? (
        <p className="flex gap-2 rounded-[10px] bg-warn-soft px-4 py-3 text-sm text-warn">
          <AlertIcon size={18} className="mt-px shrink-0" />
          <span>
            {d.deferred}
            {t.defer_count >= MAX_DEFERS ? d.deferredLast : ""}
          </span>
        </p>
      ) : t.checked_in ? (
        <p className="flex items-center gap-2 rounded-[10px] bg-ok-soft px-4 py-3 text-sm font-medium text-ok">
          <CheckIcon size={18} className="shrink-0" />
          {d.arrived}
        </p>
      ) : (
        <p className="flex items-center gap-2 rounded-[10px] bg-tint px-4 py-3 text-sm">
          <BellIcon size={18} className="shrink-0 text-accent" />
          <span>
            {isFutureDate ? (
              <>
                {d.arriveOn} <strong className="tabular-nums">{formatClinicDate(t.service_date, locale)}</strong> {d.before}{" "}
                <strong className="tabular-nums">{formatClinicTime(arriveBy, locale)}</strong>
                {d.showTicket}
              </>
            ) : (
              <>
                {d.arriveBefore} <strong className="tabular-nums">{formatClinicTime(arriveBy, locale)}</strong>
                {d.showTicket}
              </>
            )}
          </span>
        </p>
      )}
    </div>
  );
}
