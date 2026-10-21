import Image from 'next/image';
import Link from 'next/link';
import { Brand } from './brand';
import { HomepageHeader } from './header';
import { inter, playfair } from './fonts';
import styles from './home.module.css';
import {
  ArrowDown,
  ArrowRight,
  BadgeCheck,
  Building2,
  CalendarDays,
  Check,
  CircleCheck,
  Clock3,
  ContactRound,
  EyeOff,
  ListChecks,
  LockKeyhole,
  MapPin,
  MessageSquare,
  Navigation,
  Palette,
  PartyPopper,
  ReceiptText,
  ShieldCheck,
  StickyNote,
  Table2,
  UserRoundCog,
  UsersRound,
} from 'lucide-react';

function PlannedBadge() {
  return (
    <span className="planned-badge">
      <Clock3 className="size-3" aria-hidden="true" />
      Planned
    </span>
  );
}

function Hero() {
  return (
    <section
      className="w-full max-w-7xl mx-auto px-5 sm:px-8 pt-8 sm:pt-12 pb-16 lg:pb-20"
      id="home-hero"
      aria-labelledby="home-hero-title"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
        <div className="col-span-1 lg:col-span-5 flex flex-col gap-5">
          <p className="preview-note">
            Product preview · Sample content. Items marked Planned are not
            available yet.
          </p>
          <span className="text-xs font-semibold uppercase tracking-widest text-[#6E334E]">
            A little more organized. A lot more present.
          </span>
          <h1
            className="font-serif text-4xl sm:text-5xl lg:text-[3.5rem] font-normal tracking-tight text-[#242124] leading-[1.12]"
            id="home-hero-title"
          >
            Plan every moment.
            <br />
            <span className="italic text-[#6E334E] font-normal">
              Enjoy every memory.
            </span>
          </h1>
          <p className="font-sans text-base sm:text-lg text-[#5C5457] leading-relaxed">
            Bring your wedding events, tasks and family together in one
            beautifully organized place.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link
              className="inline-flex items-center justify-center bg-[#6E334E] hover:bg-[#542439] text-white font-sans text-sm font-medium px-7 py-3.5 rounded-full transition-all shadow-sm"
              href="/register"
            >
              Start Planning
            </Link>
            <a
              className="inline-flex items-center justify-center bg-[#FFFDFC] hover:bg-[#F5EEE7] border border-[#E7DED7] text-[#242124] font-sans text-sm font-medium px-6 py-3.5 rounded-full transition-colors shadow-sm"
              href="#how-it-works"
            >
              See How It Works
            </a>
          </div>
          <p className="text-xs text-[#5C5457] font-sans pt-1">
            Designed for multi-day Indian weddings and celebrations.
          </p>
          <p className="preview-note" id="login-note">
            Create an account or sign in to your planning workspace.
          </p>
        </div>
        <div className="col-span-1 lg:col-span-7 relative flex flex-col sm:flex-row gap-4 items-stretch justify-center">
          <div className="w-full sm:w-[68%] bg-[#FFFDFC] border border-[#E7DED7] rounded-2xl p-5 sm:p-6 shadow-[0_4px_24px_rgba(0,0,0,0.03)] flex flex-col justify-between gap-5 font-sans">
            <div className="flex items-center justify-between pb-3.5 border-b border-[#E7DED7]/70">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#F5EEE7] flex items-center justify-center text-[#6E334E] font-sans font-semibold text-xs border border-[#E7DED7]">
                  A&amp;K
                </div>
                <div>
                  <div className="text-[11px] font-semibold tracking-wider uppercase text-[#5C5457]">
                    Sample Wedding
                  </div>
                  <h3 className="font-sans text-base font-semibold text-[#242124]">
                    Anya &amp; Kabir
                  </h3>
                </div>
              </div>
              <span className="text-[11px] font-semibold text-[#6E334E] bg-[#F5EEE7] px-2.5 py-1 rounded-full">
                1 Jan 2027
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#F5EEE7]/80 border border-[#E7DED7]/70 p-3 rounded-xl">
                <span className="block text-[10px] uppercase tracking-wider text-[#5C5457] font-medium">
                  Countdown
                </span>
                <span className="text-base font-bold text-[#242124] mt-0.5 block">
                  50 Days
                </span>
                <span className="text-[11px] text-[#5C5457]">
                  Feb 20, 2027 Wedding
                </span>
              </div>
              <div className="bg-[#F5EEE7]/80 border border-[#E7DED7]/70 p-3 rounded-xl">
                <span className="block text-[10px] uppercase tracking-wider text-[#5C5457] font-medium">
                  Planning Progress
                </span>
                <span className="text-base font-bold text-[#6E334E] mt-0.5 block">
                  68%
                </span>
                <span className="text-[11px] text-[#5C5457]">
                  34 of 50 tasks completed
                </span>
              </div>
            </div>
            <div className="bg-[#F5EEE7]/70 border border-[#E7DED7]/80 rounded-xl p-3.5 flex items-center justify-between gap-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-[#6E334E] text-white flex items-center justify-center shrink-0 mt-0.5">
                  <PartyPopper
                    className="h-[16px] w-[16px] shrink-0"
                    aria-hidden="true"
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#6E334E]">
                      Next Celebration
                    </span>
                    <span className="text-[11px] text-[#5C5457]">
                      • In 48 days
                    </span>
                  </div>
                  <h4 className="text-xs font-semibold text-[#242124] truncate pt-0.5">
                    Mehendi Sundowner • Courtyard
                  </h4>
                </div>
              </div>
              <span className="text-[11px] font-medium text-[#5C5457] shrink-0 font-mono">
                Feb 18
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2 text-xs">
              <div className="flex items-center justify-between p-2.5 bg-[#FBF7F2] border border-[#E7DED7]/70 rounded-lg">
                <div className="flex items-center gap-2 min-w-0">
                  <CircleCheck
                    className="text-emerald-700 h-[15px] w-[15px] shrink-0"
                    aria-hidden="true"
                  />
                  <span className="font-medium text-[#242124] truncate">
                    Photographer Shot List
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  <span className="text-[10px] text-[#5C5457] bg-[#F5EEE7] px-1.5 py-0.5 rounded">
                    Rahul
                  </span>
                  <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200/60 px-1.5 py-0.5 rounded">
                    Completed
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between p-2.5 bg-[#FBF7F2] border border-[#E7DED7]/70 rounded-lg">
                <div className="flex items-center gap-2 min-w-0">
                  <Clock3
                    className="text-[#6E334E] h-[15px] w-[15px] shrink-0"
                    aria-hidden="true"
                  />
                  <span className="font-medium text-[#242124] truncate">
                    Haldi Décor &amp; Samagri
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  <span className="text-[10px] text-[#5C5457] bg-[#F5EEE7] px-1.5 py-0.5 rounded">
                    Mom
                  </span>
                  <span className="text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200/60 px-1.5 py-0.5 rounded">
                    In Progress
                  </span>
                </div>
              </div>
            </div>
            <div className="pt-2.5 border-t border-[#E7DED7]/70 flex items-center justify-between text-xs">
              <div className="text-[11px] text-[#5C5457]">
                <strong className="font-semibold text-[#242124]">
                  348 of 420 guests confirmed
                  <PlannedBadge />
                </strong>
              </div>
              <span className="text-[11px] font-semibold text-[#6E334E] bg-[#F5EEE7] px-2 py-0.5 rounded-full">
                83% Confirmed
              </span>
            </div>
          </div>
          <div className="w-full sm:w-[32%] bg-[#FFFDFC] border border-[#E7DED7] rounded-2xl p-2.5 shadow-[0_4px_24px_rgba(0,0,0,0.03)] flex flex-col justify-between">
            <div className="relative w-full rounded-xl overflow-hidden aspect-[3/4] sm:h-full bg-[#F5EEE7] hero-photo">
              <Image
                alt="Sample couple Anya and Kabir in ivory and blush wedding attire"
                className="w-full h-full object-cover object-center filter saturate-[0.95]"
                src="/images/sample-couple.webp"
                width={896}
                height={1200}
                sizes="(min-width: 1280px) 220px, (min-width: 640px) 30vw, 90vw"
                loading="eager"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#242124]/80 via-transparent to-transparent" />
              <div className="absolute bottom-3 left-3 right-3 text-white">
                <span className="text-[10px] font-sans font-medium tracking-widest uppercase text-[#D6BE91] block">
                  Udaipur
                </span>
                <h4 className="font-serif text-sm sm:text-base font-normal">
                  Anya &amp; Kabir
                </h4>
                <p className="text-[10px] text-white/80 font-sans">
                  Feb 18–21, 2027
                </p>
              </div>
            </div>
            <div className="mt-2 p-2 bg-[#F5EEE7]/80 border border-[#E7DED7]/60 rounded-xl flex items-center justify-between text-[11px] font-sans">
              <span className="text-[#5C5457]">Ceremonies</span>
              <span className="font-semibold text-[#6E334E]">6 Connected</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Clarity() {
  return (
    <section
      className="w-full bg-[#F5EEE7] py-20 border-y border-[#E7DED7]"
      id="clarity"
      aria-labelledby="clarity-title"
    >
      <div className="max-w-7xl mx-auto px-5 sm:px-8 flex flex-col gap-12">
        <div className="text-center max-w-2xl mx-auto flex flex-col gap-3">
          <span className="text-xs font-semibold uppercase tracking-widest text-[#6E334E]">
            Clarity Restored
          </span>
          <h2
            className="font-serif text-3xl sm:text-4xl font-normal text-[#242124]"
            id="clarity-title"
          >
            Too many places to keep track. One calm workspace.
          </h2>
          <p className="font-sans text-sm sm:text-base text-[#5C5457]">
            When every detail lives across separate chats and files, things slip
            through. Make My Marriage brings every stream into one quiet,
            synchronized view.
          </p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center font-sans">
          <div className="lg:col-span-5 flex flex-col gap-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#5C5457] px-1 mb-1">
              Too many places to keep track
            </span>
            <div className="p-3.5 rounded-xl bg-[#FFFDFC] border border-[#E7DED7] flex items-center gap-3 shadow-sm">
              <MessageSquare
                className="text-[#5C5457] h-[20px] w-[20px] shrink-0"
                aria-hidden="true"
              />
              <span className="text-xs font-medium text-[#242124]">
                Scattered chats &amp; WhatsApp groups
              </span>
            </div>
            <div className="p-3.5 rounded-xl bg-[#FFFDFC] border border-[#E7DED7] flex items-center gap-3 shadow-sm">
              <Table2
                className="text-[#5C5457] h-[20px] w-[20px] shrink-0"
                aria-hidden="true"
              />
              <span className="text-xs font-medium text-[#242124]">
                Conflicting spreadsheets &amp; version copies
              </span>
            </div>
            <div className="p-3.5 rounded-xl bg-[#FFFDFC] border border-[#E7DED7] flex items-center gap-3 shadow-sm">
              <StickyNote
                className="text-[#5C5457] h-[20px] w-[20px] shrink-0"
                aria-hidden="true"
              />
              <span className="text-xs font-medium text-[#242124]">
                Separate notes &amp; song rehearsal clips
              </span>
            </div>
            <div className="p-3.5 rounded-xl bg-[#FFFDFC] border border-[#E7DED7] flex items-center gap-3 shadow-sm">
              <ContactRound
                className="text-[#5C5457] h-[20px] w-[20px] shrink-0"
                aria-hidden="true"
              />
              <span className="text-xs font-medium text-[#242124]">
                Unverified guest lists &amp; RSVP follow-ups
              </span>
            </div>
            <div className="p-3.5 rounded-xl bg-[#FFFDFC] border border-[#E7DED7] flex items-center gap-3 shadow-sm">
              <ReceiptText
                className="text-[#5C5457] h-[20px] w-[20px] shrink-0"
                aria-hidden="true"
              />
              <span className="text-xs font-medium text-[#242124]">
                Vendor messages &amp; pending payments
              </span>
            </div>
          </div>
          <div className="lg:col-span-2 flex flex-col items-center justify-center py-4 lg:py-0">
            <div className="hidden lg:flex flex-col items-center gap-2">
              <div className="w-px h-12 bg-[#E7DED7]" />
              <div className="w-10 h-10 rounded-full bg-[#FFFDFC] border border-[#E7DED7] flex items-center justify-center text-[#6E334E] shadow-sm">
                <ArrowRight
                  className="h-[20px] w-[20px] shrink-0"
                  aria-hidden="true"
                />
              </div>
              <div className="w-px h-12 bg-[#E7DED7]" />
            </div>
            <div className="flex lg:hidden items-center justify-center">
              <div className="w-10 h-10 rounded-full bg-[#FFFDFC] border border-[#E7DED7] flex items-center justify-center text-[#6E334E] shadow-sm">
                <ArrowDown
                  className="h-[20px] w-[20px] shrink-0"
                  aria-hidden="true"
                />
              </div>
            </div>
          </div>
          <div className="lg:col-span-5 bg-[#FFFDFC] border border-[#E7DED7] rounded-2xl p-6 sm:p-7 shadow-sm flex flex-col gap-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#E7DED7]/70">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#6E334E] text-white flex items-center justify-center">
                  <BadgeCheck
                    className="h-[18px] w-[18px] shrink-0"
                    aria-hidden="true"
                  />
                </div>
                <div>
                  <h4 className="font-sans text-base font-semibold text-[#242124]">
                    Make My Marriage Dashboard
                  </h4>
                  <p className="text-[11px] text-[#5C5457]">
                    Single organized workspace
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-semibold text-[#6E334E] bg-[#F5EEE7] px-2.5 py-1 rounded-full">
                One Quiet View
              </span>
            </div>
            <ul className="flex flex-col gap-3.5 text-xs text-[#242124]">
              <li className="flex items-start gap-2.5">
                <Check
                  className="text-[#6E334E] mt-0.5 h-[16px] w-[16px] shrink-0"
                  aria-hidden="true"
                />
                <span>
                  All ceremonies, schedules, and run-sheets mapped in one
                  continuous thread
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check
                  className="text-[#6E334E] mt-0.5 h-[16px] w-[16px] shrink-0"
                  aria-hidden="true"
                />
                <span>
                  Guest RSVPs, meal preferences, and arrivals organized without
                  chaos
                  <PlannedBadge />
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check
                  className="text-[#6E334E] mt-0.5 h-[16px] w-[16px] shrink-0"
                  aria-hidden="true"
                />
                <span>Give family members access based on their role</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check
                  className="text-[#6E334E] mt-0.5 h-[16px] w-[16px] shrink-0"
                  aria-hidden="true"
                />
                <span>
                  Financial details stay private to authorized members
                  <PlannedBadge />
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section
      className="w-full max-w-7xl mx-auto px-5 sm:px-8 py-20"
      id="features"
      aria-labelledby="features-title"
    >
      <div className="flex flex-col gap-10">
        <div className="max-w-2xl flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-[#6E334E]">
            Structured Overview
          </span>
          <h2
            className="font-serif text-3xl sm:text-4xl font-normal text-[#242124]"
            id="features-title"
          >
            One calm place for your whole wedding.
          </h2>
          <p className="font-sans text-sm sm:text-base text-[#5C5457]">
            Coordinated views to organize your multi-day events, family roles,
            guest rosters, and decisions in quiet harmony.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-5 font-sans">
          <div className="lg:col-span-8 bg-[#FFFDFC] border border-[#E7DED7] rounded-2xl p-6 sm:p-8 flex flex-col justify-between gap-6 shadow-sm">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#6E334E]">
                  Overview
                </span>
                <span className="text-xs text-[#5C5457] font-mono">
                  Sample wedding: Anya &amp; Kabir
                </span>
              </div>
              <h3 className="text-2xl font-semibold text-[#242124]">
                Master Wedding Dashboard
              </h3>
              <p className="text-sm text-[#5C5457] max-w-xl">
                Real-time visibility across countdown days, ceremony milestones,
                and pending items.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-2">
              <div className="bg-[#F5EEE7]/70 border border-[#E7DED7]/70 p-4 rounded-xl">
                <span className="text-[11px] uppercase tracking-wider text-[#5C5457] font-medium block">
                  Countdown
                </span>
                <span className="text-xl font-bold text-[#242124] mt-1 block">
                  50 Days
                </span>
                <span className="text-[11px] text-[#5C5457]">
                  Feb 20, 2027 Wedding
                </span>
              </div>
              <div className="bg-[#F5EEE7]/70 border border-[#E7DED7]/70 p-4 rounded-xl">
                <span className="text-[11px] uppercase tracking-wider text-[#5C5457] font-medium block">
                  Ceremony Status
                </span>
                <span className="text-sm font-semibold text-[#6E334E] mt-1.5 block">
                  1 Completed · 4 Confirmed · 1 Planned
                </span>
                <span className="text-[11px] text-[#5C5457] mt-0.5 block">
                  6 Celebrations total
                </span>
              </div>
              <div className="bg-[#F5EEE7]/70 border border-[#E7DED7]/70 p-4 rounded-xl">
                <span className="text-[11px] uppercase tracking-wider text-[#5C5457] font-medium block">
                  RSVP Totals
                  <PlannedBadge />
                </span>
                <span className="text-xl font-bold text-[#242124] mt-1 block">
                  348 of 420
                </span>
                <span className="text-[11px] font-semibold text-[#6E334E]">
                  83% Confirmed
                </span>
              </div>
            </div>
            <div className="p-3.5 bg-[#FBF7F2] border border-[#E7DED7]/70 rounded-xl flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#D6BE91]" />
                <span className="text-[#242124] font-medium">
                  Pending Decision:
                </span>
                <span className="text-[#5C5457]">
                  Finalize acoustic setup for Sangeet courtyard
                </span>
              </div>
              <span className="text-[11px] text-[#6E334E] font-semibold">
                Due in 5 days
              </span>
            </div>
          </div>
          <div className="lg:col-span-4 bg-[#FFFDFC] border border-[#E7DED7] rounded-2xl p-6 flex flex-col justify-between gap-5 shadow-sm">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#6E334E]">
                  Schedules
                </span>
                <span className="text-xs text-[#5C5457] font-medium">
                  6 Ceremonies
                </span>
              </div>
              <h3 className="text-xl font-semibold text-[#242124]">
                Multi-Day Ceremonies
              </h3>
              <p className="text-xs text-[#5C5457]">
                Dedicated timelines, run-sheets, and dress palettes for every
                ceremony.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <div className="p-3 bg-[#F5EEE7]/70 border border-[#E7DED7]/60 rounded-xl flex items-center justify-between text-xs">
                <div>
                  <div className="font-medium text-[#242124]">
                    Mehendi Sundowner
                  </div>
                  <div className="text-[11px] text-[#5C5457]">
                    Courtyard • 4:00 PM
                  </div>
                </div>
                <span className="text-[11px] font-mono text-[#5C5457]">
                  Feb 18
                </span>
              </div>
              <div className="p-3 bg-[#F5EEE7]/70 border border-[#E7DED7]/60 rounded-xl flex items-center justify-between text-xs">
                <div>
                  <div className="font-medium text-[#242124]">
                    Haldi Ceremony
                  </div>
                  <div className="text-[11px] text-[#5C5457]">
                    Poolside • 10:30 AM
                  </div>
                </div>
                <span className="text-[11px] font-mono text-[#5C5457]">
                  Feb 19 AM
                </span>
              </div>
              <div className="p-3 bg-[#F5EEE7]/70 border border-[#E7DED7]/60 rounded-xl flex items-center justify-between text-xs">
                <div>
                  <div className="font-medium text-[#242124]">Sangeet Gala</div>
                  <div className="text-[11px] text-[#5C5457]">
                    Grand Ballroom • 7:30 PM
                  </div>
                </div>
                <span className="text-[11px] font-mono text-[#5C5457]">
                  Feb 19 PM
                </span>
              </div>
            </div>
          </div>
          <div className="lg:col-span-4 bg-[#FFFDFC] border border-[#E7DED7] rounded-2xl p-6 flex flex-col justify-between gap-5 shadow-sm">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#6E334E]">
                  Checklist
                </span>
                <span className="text-xs text-[#5C5457]">By Assignee</span>
              </div>
              <h3 className="text-xl font-semibold text-[#242124]">
                Categorized Tasks
              </h3>
              <p className="text-xs text-[#5C5457]">
                Filter tasks by category, owner, and due date so nothing
                overlaps.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <div className="p-3 bg-[#F5EEE7]/70 border border-[#E7DED7]/60 rounded-xl flex items-center justify-between text-xs">
                <div className="truncate mr-2">
                  <div className="font-medium text-[#242124] truncate">
                    Photographer Shot List
                  </div>
                  <div className="text-[11px] text-[#5C5457]">
                    Assigned: Rahul
                  </div>
                </div>
                <span className="text-[11px] px-2 py-0.5 rounded bg-[#FFFDFC] text-emerald-800 font-medium shrink-0 border border-emerald-200/50">
                  Completed
                </span>
              </div>
              <div className="p-3 bg-[#F5EEE7]/70 border border-[#E7DED7]/60 rounded-xl flex items-center justify-between text-xs">
                <div className="truncate mr-2">
                  <div className="font-medium text-[#242124] truncate">
                    Confirm Mithai hampers
                  </div>
                  <div className="text-[11px] text-[#5C5457]">
                    Assigned: Mom
                  </div>
                </div>
                <span className="text-[11px] px-2 py-0.5 rounded bg-[#FFFDFC] text-amber-800 font-medium shrink-0 border border-amber-200/50">
                  In Progress
                </span>
              </div>
            </div>
          </div>
          <div className="lg:col-span-4 bg-[#FFFDFC] border border-[#E7DED7] rounded-2xl p-6 flex flex-col justify-between gap-5 shadow-sm">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#6E334E]">
                  Family Hub
                </span>
                <span className="text-xs text-[#5C5457]">Roles</span>
              </div>
              <h3 className="text-xl font-semibold text-[#242124]">
                Family Collaboration
              </h3>
              <p className="text-xs text-[#5C5457]">
                Give family members access based on their role so sensitive
                notes stay private.
              </p>
            </div>
            <div className="p-3.5 bg-[#F5EEE7]/70 border border-[#E7DED7]/60 rounded-xl flex flex-col gap-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-medium text-[#242124]">
                  Family tasks and responsibilities
                </span>
                <span className="text-[11px] text-[#5C5457]">4 members</span>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <span className="w-6 h-6 rounded-full bg-[#6E334E] text-white flex items-center justify-center text-[10px] font-semibold">
                  M
                </span>
                <span className="w-6 h-6 rounded-full bg-[#D6BE91] text-[#242124] flex items-center justify-center text-[10px] font-semibold">
                  R
                </span>
                <span className="w-6 h-6 rounded-full bg-[#D7B0B8] text-[#6E334E] flex items-center justify-center text-[10px] font-semibold">
                  P
                </span>
                <span className="text-[11px] text-[#5C5457] ml-1">
                  Assigned leads view priorities
                </span>
              </div>
            </div>
          </div>
          <div className="lg:col-span-4 bg-[#FFFDFC] border border-[#E7DED7] rounded-2xl p-6 flex flex-col justify-between gap-5 shadow-sm">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#6E334E]">
                  Progress
                </span>
                <span className="text-xs text-[#5C5457]">Overall</span>
              </div>
              <h3 className="text-xl font-semibold text-[#242124]">
                Planning Progress
              </h3>
              <p className="text-xs text-[#5C5457]">
                Consolidated tracking for invitations, ceremony schedules, and
                logistics.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <div className="p-3 bg-[#F5EEE7]/70 border border-[#E7DED7]/60 rounded-xl flex items-center justify-between text-xs">
                <span className="font-medium text-[#242124]">
                  Tasks Completed
                </span>
                <span className="text-[#6E334E] font-semibold">
                  68% (34 of 50)
                </span>
              </div>
              <div className="p-3 bg-[#F5EEE7]/70 border border-[#E7DED7]/60 rounded-xl flex items-center justify-between text-xs">
                <span className="font-medium text-[#242124]">
                  RSVP Status
                  <PlannedBadge />
                </span>
                <span className="font-semibold text-[#242124]">
                  348 Confirmed (83%)
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Celebrations() {
  return (
    <section
      className="w-full bg-[#F5EEE7] py-20 border-y border-[#E7DED7]"
      id="celebrations"
      aria-labelledby="celebrations-title"
    >
      <div className="max-w-7xl mx-auto px-5 sm:px-8 flex flex-col gap-12">
        <div className="max-w-3xl flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-[#6E334E]">
            Continuous Thread
          </span>
          <h2
            className="font-serif text-3xl sm:text-4xl font-normal text-[#242124]"
            id="celebrations-title"
          >
            Every celebration, beautifully connected.
          </h2>
          <p className="font-sans text-sm sm:text-base text-[#5C5457]">
            Your traditions are unique. Your plan should make room for all of
            them.
          </p>
          <p className="font-sans text-xs text-[#5C5457] italic pt-0.5">
            Add your own ceremonies and make the schedule yours.
          </p>
        </div>
        <div className="hidden lg:block relative w-full pt-6 pb-2">
          <div className="absolute top-[35px] left-[8%] right-[8%] h-[2px] bg-[#E7DED7] z-0" />
          <div className="grid grid-cols-6 gap-3 relative z-10">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-8 h-8 rounded-full bg-[#F5EEE7] border-2 border-[#5C5457] flex items-center justify-center text-[#5C5457] shadow-sm z-10 bg-white">
                <Check
                  className="h-[16px] w-[16px] shrink-0"
                  aria-hidden="true"
                />
              </div>
              <div className="w-full bg-[#FFFDFC] border border-[#E7DED7] rounded-xl p-3.5 text-left flex flex-col gap-1.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-[#5C5457]">
                    12 Dec 2026
                  </span>
                  <span className="text-[10px] font-medium text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                    Completed
                  </span>
                </div>
                <h4 className="font-sans text-sm font-semibold text-[#242124]">
                  Engagement
                </h4>
                <p className="text-[11px] text-[#5C5457]">
                  Ring Ceremony &amp; Lunch
                </p>
                <div className="pt-1.5 border-t border-[#E7DED7]/60 text-[10px] text-[#5C5457]">
                  The Villa
                </div>
              </div>
            </div>
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-8 h-8 rounded-full bg-white border-2 border-[#6E334E] flex items-center justify-center text-[#6E334E] font-sans text-xs font-semibold shadow-sm z-10">
                2
              </div>
              <div className="w-full bg-[#FFFDFC] border border-[#E7DED7] rounded-xl p-3.5 text-left flex flex-col gap-1.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-[#5C5457]">
                    18 Feb 2027
                  </span>
                  <span className="text-[10px] font-medium text-[#6E334E] bg-[#F5EEE7] px-2 py-0.5 rounded-full">
                    Confirmed
                  </span>
                </div>
                <h4 className="font-sans text-sm font-semibold text-[#242124]">
                  Mehendi
                </h4>
                <p className="text-[11px] text-[#5C5457]">
                  Henna &amp; Sundowner
                </p>
                <div className="pt-1.5 border-t border-[#E7DED7]/60 text-[10px] text-[#5C5457]">
                  Courtyard
                </div>
              </div>
            </div>
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-8 h-8 rounded-full bg-white border-2 border-[#6E334E] flex items-center justify-center text-[#6E334E] font-sans text-xs font-semibold shadow-sm z-10">
                3
              </div>
              <div className="w-full bg-[#FFFDFC] border border-[#E7DED7] rounded-xl p-3.5 text-left flex flex-col gap-1.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-[#5C5457]">
                    19 Feb 2027
                  </span>
                  <span className="text-[10px] font-medium text-[#6E334E] bg-[#F5EEE7] px-2 py-0.5 rounded-full">
                    Confirmed
                  </span>
                </div>
                <h4 className="font-sans text-sm font-semibold text-[#242124]">
                  Haldi
                </h4>
                <p className="text-[11px] text-[#5C5457]">
                  Morning Floral Ritual
                </p>
                <div className="pt-1.5 border-t border-[#E7DED7]/60 text-[10px] text-[#5C5457]">
                  Poolside
                </div>
              </div>
            </div>
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-8 h-8 rounded-full bg-white border-2 border-[#6E334E] flex items-center justify-center text-[#6E334E] font-sans text-xs font-semibold shadow-sm z-10">
                4
              </div>
              <div className="w-full bg-[#FFFDFC] border border-[#E7DED7] rounded-xl p-3.5 text-left flex flex-col gap-1.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-[#5C5457]">
                    19 Feb 2027
                  </span>
                  <span className="text-[10px] font-medium text-[#6E334E] bg-[#F5EEE7] px-2 py-0.5 rounded-full">
                    Confirmed
                  </span>
                </div>
                <h4 className="font-sans text-sm font-semibold text-[#242124]">
                  Sangeet
                </h4>
                <p className="text-[11px] text-[#5C5457]">
                  Evening Music &amp; Gala
                </p>
                <div className="pt-1.5 border-t border-[#E7DED7]/60 text-[10px] text-[#5C5457]">
                  Grand Ballroom
                </div>
              </div>
            </div>
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-8 h-8 rounded-full bg-[#6E334E] text-white flex items-center justify-center font-sans text-xs font-bold shadow-md z-10 ring-4 ring-[#D7B0B8]/40">
                5
              </div>
              <div className="w-full bg-[#FFFDFC] border-2 border-[#6E334E] rounded-xl p-3.5 text-left flex flex-col gap-1.5 shadow-md">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono font-semibold text-[#242124]">
                    20 Feb 2027
                  </span>
                  <span className="text-[10px] font-semibold text-white bg-[#6E334E] px-2 py-0.5 rounded-full">
                    Confirmed
                  </span>
                </div>
                <h4 className="font-sans text-sm font-bold text-[#242124]">
                  Wedding
                </h4>
                <p className="text-[11px] text-[#5C5457]">
                  Baraat &amp; Sacred Phere
                </p>
                <div className="pt-1.5 border-t border-[#E7DED7]/60 text-[10px] text-[#6E334E] font-medium">
                  Palace Mandap
                </div>
              </div>
            </div>
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-8 h-8 rounded-full bg-white border-2 border-[#E7DED7] flex items-center justify-center text-[#5C5457] font-sans text-xs font-semibold shadow-sm z-10">
                6
              </div>
              <div className="w-full bg-[#FFFDFC] border border-[#E7DED7] rounded-xl p-3.5 text-left flex flex-col gap-1.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-[#5C5457]">
                    21 Feb 2027
                  </span>
                  <span className="text-[10px] font-medium text-[#5C5457] bg-[#F5EEE7] px-2 py-0.5 rounded-full">
                    Planned
                  </span>
                </div>
                <h4 className="font-sans text-sm font-semibold text-[#242124]">
                  Reception
                </h4>
                <p className="text-[11px] text-[#5C5457]">
                  Formal Evening Dinner
                </p>
                <div className="pt-1.5 border-t border-[#E7DED7]/60 text-[10px] text-[#5C5457]">
                  Lakeside Lawn
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="block lg:hidden relative pl-6 border-l-2 border-[#E7DED7] ml-4 flex flex-col gap-6">
          <div className="relative flex flex-col gap-1.5 bg-[#FFFDFC] border border-[#E7DED7] rounded-xl p-4 shadow-sm">
            <span className="absolute -left-[33px] top-4 w-6 h-6 rounded-full bg-white border-2 border-[#5C5457] flex items-center justify-center text-[#5C5457]">
              <Check
                className="h-[13px] w-[13px] shrink-0"
                aria-hidden="true"
              />
            </span>
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-[#5C5457]">
                12 Dec 2026
              </span>
              <span className="text-[10px] font-medium text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                Completed
              </span>
            </div>
            <h4 className="font-sans text-sm font-semibold text-[#242124]">
              Engagement
            </h4>
            <p className="text-xs text-[#5C5457]">
              Ring Ceremony &amp; Luncheon • The Villa
            </p>
          </div>
          <div className="relative flex flex-col gap-1.5 bg-[#FFFDFC] border border-[#E7DED7] rounded-xl p-4 shadow-sm">
            <span className="absolute -left-[33px] top-4 w-6 h-6 rounded-full bg-white border-2 border-[#6E334E] flex items-center justify-center text-[#6E334E] text-xs font-semibold">
              2
            </span>
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-[#5C5457]">
                18 Feb 2027
              </span>
              <span className="text-[10px] font-medium text-[#6E334E] bg-[#F5EEE7] px-2 py-0.5 rounded-full">
                Confirmed
              </span>
            </div>
            <h4 className="font-sans text-sm font-semibold text-[#242124]">
              Mehendi
            </h4>
            <p className="text-xs text-[#5C5457]">
              Henna &amp; Sundowner • Courtyard
            </p>
          </div>
          <div className="relative flex flex-col gap-1.5 bg-[#FFFDFC] border border-[#E7DED7] rounded-xl p-4 shadow-sm">
            <span className="absolute -left-[33px] top-4 w-6 h-6 rounded-full bg-white border-2 border-[#6E334E] flex items-center justify-center text-[#6E334E] text-xs font-semibold">
              3
            </span>
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-[#5C5457]">
                19 Feb 2027, Morning
              </span>
              <span className="text-[10px] font-medium text-[#6E334E] bg-[#F5EEE7] px-2 py-0.5 rounded-full">
                Confirmed
              </span>
            </div>
            <h4 className="font-sans text-sm font-semibold text-[#242124]">
              Haldi
            </h4>
            <p className="text-xs text-[#5C5457]">
              Morning Floral Ritual • Poolside
            </p>
          </div>
          <div className="relative flex flex-col gap-1.5 bg-[#FFFDFC] border border-[#E7DED7] rounded-xl p-4 shadow-sm">
            <span className="absolute -left-[33px] top-4 w-6 h-6 rounded-full bg-white border-2 border-[#6E334E] flex items-center justify-center text-[#6E334E] text-xs font-semibold">
              4
            </span>
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-[#5C5457]">
                19 Feb 2027, Evening
              </span>
              <span className="text-[10px] font-medium text-[#6E334E] bg-[#F5EEE7] px-2 py-0.5 rounded-full">
                Confirmed
              </span>
            </div>
            <h4 className="font-sans text-sm font-semibold text-[#242124]">
              Sangeet
            </h4>
            <p className="text-xs text-[#5C5457]">
              Musical Night &amp; Dinner • Ballroom
            </p>
          </div>
          <div className="relative flex flex-col gap-1.5 bg-[#FFFDFC] border-2 border-[#6E334E] rounded-xl p-4 shadow-md">
            <span className="absolute -left-[33px] top-4 w-6 h-6 rounded-full bg-[#6E334E] text-white flex items-center justify-center text-xs font-bold ring-2 ring-[#D7B0B8]">
              5
            </span>
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-semibold text-[#242124]">
                20 Feb 2027
              </span>
              <span className="text-[10px] font-semibold text-white bg-[#6E334E] px-2 py-0.5 rounded-full">
                Confirmed
              </span>
            </div>
            <h4 className="font-sans text-sm font-bold text-[#242124]">
              Wedding
            </h4>
            <p className="text-xs text-[#5C5457]">
              Baraat &amp; Sacred Phere • Palace Mandap
            </p>
          </div>
          <div className="relative flex flex-col gap-1.5 bg-[#FFFDFC] border border-[#E7DED7] rounded-xl p-4 shadow-sm">
            <span className="absolute -left-[33px] top-4 w-6 h-6 rounded-full bg-white border-2 border-[#E7DED7] flex items-center justify-center text-[#5C5457] text-xs font-semibold">
              6
            </span>
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-[#5C5457]">
                21 Feb 2027
              </span>
              <span className="text-[10px] font-medium text-[#5C5457] bg-[#F5EEE7] px-2 py-0.5 rounded-full">
                Planned
              </span>
            </div>
            <h4 className="font-sans text-sm font-semibold text-[#242124]">
              Reception
            </h4>
            <p className="text-xs text-[#5C5457]">
              Formal Evening Dinner • Lakeside Lawn
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Family() {
  return (
    <section
      className="w-full max-w-7xl mx-auto px-5 sm:px-8 py-20"
      id="for-families"
      aria-labelledby="for-families-title"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
        <div className="lg:col-span-5 flex flex-col gap-4">
          <span className="text-xs font-semibold uppercase tracking-widest text-[#6E334E]">
            Plan Together
          </span>
          <h2
            className="font-serif text-3xl sm:text-4xl font-normal text-[#242124] leading-tight"
            id="for-families-title"
          >
            Planning a wedding takes a family. Keep everyone in sync.
          </h2>
          <p className="font-sans text-sm sm:text-base text-[#5C5457] leading-relaxed">
            Bring everyone together with clear responsibilities, so everyone
            knows how they can help.
          </p>
          <div className="flex flex-col gap-3 pt-2 font-sans">
            <div className="flex items-start gap-3">
              <UserRoundCog
                className="text-[#6E334E] shrink-0 mt-0.5 h-[20px] w-[20px] shrink-0"
                aria-hidden="true"
              />
              <p className="text-xs sm:text-sm text-[#5C5457]">
                <strong className="font-medium text-[#242124]">
                  Role-based access:
                </strong>{' '}
                Admin manages the wedding, Family Member helps plan, and Viewer
                has read-only access.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <ListChecks
                className="text-[#6E334E] shrink-0 mt-0.5 h-[20px] w-[20px] shrink-0"
                aria-hidden="true"
              />
              <p className="text-xs sm:text-sm text-[#5C5457]">
                <strong className="font-medium text-[#242124]">
                  Clear responsibilities:
                </strong>{' '}
                Assign logistics directly to key leads with clear status
                indicators.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <EyeOff
                className="text-[#6E334E] shrink-0 mt-0.5 h-[20px] w-[20px] shrink-0"
                aria-hidden="true"
              />
              <p className="text-xs sm:text-sm text-[#5C5457]">
                <strong className="font-medium text-[#242124]">
                  Discreet boundaries:
                </strong>{' '}
                Financial details stay private to authorized members.
              </p>
            </div>
          </div>
        </div>
        <div className="lg:col-span-7 bg-[#FFFDFC] border border-[#E7DED7] rounded-2xl p-6 sm:p-7 shadow-sm flex flex-col gap-4 font-sans">
          <div className="flex items-center justify-between pb-3 border-b border-[#E7DED7]/70">
            <div>
              <h4 className="text-base font-semibold text-[#242124]">
                Family tasks and responsibilities
              </h4>
              <p className="text-xs text-[#5C5457]">
                Live coordination across family roles
              </p>
            </div>
            <span className="text-xs bg-[#F5EEE7] px-3 py-1 rounded-full text-[#242124] font-medium">
              3 Active Leads
            </span>
          </div>
          <div className="p-4 rounded-xl bg-[#F5EEE7]/60 border border-[#E7DED7]/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#FFFDFC] border border-[#E7DED7] text-[#242124] flex items-center justify-center font-semibold text-xs">
                RK
              </div>
              <div>
                <div className="text-xs font-semibold text-[#242124]">
                  Confirm photographer shot list
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-[#5C5457]">Rahul</span>
                  <span className="text-[11px] bg-[#FFFDFC] px-2 py-0.5 rounded text-[#5C5457] border border-[#E7DED7]/60">
                    Brother of Groom • Family Member
                  </span>
                </div>
              </div>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-semibold self-start sm:self-auto">
              Completed
            </span>
          </div>
          <div className="p-4 rounded-xl bg-[#F5EEE7]/60 border border-[#E7DED7]/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#FFFDFC] border border-[#E7DED7] text-[#242124] flex items-center justify-center font-semibold text-xs">
                MK
              </div>
              <div>
                <div className="text-xs font-semibold text-[#242124]">
                  Finalize Haldi décor &amp; samagri
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-[#5C5457]">Mom</span>
                  <span className="text-[11px] bg-[#FFFDFC] px-2 py-0.5 rounded text-[#5C5457] border border-[#E7DED7]/60">
                    Mother of Bride • Admin
                  </span>
                </div>
              </div>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 font-semibold self-start sm:self-auto">
              In Progress
            </span>
          </div>
          <div className="p-4 rounded-xl bg-[#F5EEE7]/60 border border-[#E7DED7]/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#FFFDFC] border border-[#E7DED7] text-[#242124] flex items-center justify-center font-semibold text-xs">
                PS
              </div>
              <div>
                <div className="text-xs font-semibold text-[#242124]">
                  Guest accommodation room allocations
                  <PlannedBadge />
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-[#5C5457]">Priya</span>
                  <span className="text-[11px] bg-[#FFFDFC] px-2 py-0.5 rounded text-[#5C5457] border border-[#E7DED7]/60">
                    Sister / MOH • Family Member
                  </span>
                </div>
              </div>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-[#F5EEE7] text-[#242124] border border-[#E7DED7] font-semibold self-start sm:self-auto">
              To Do
            </span>
          </div>
          <div className="mt-1 p-3 bg-[#FBF7F2] border border-[#E7DED7]/80 rounded-xl flex items-center justify-between text-xs text-[#5C5457]">
            <span>
              Financial details stay private to authorized members.
              <PlannedBadge />
            </span>
            <LockKeyhole
              className="text-[#6E334E] h-[16px] w-[16px] shrink-0"
              aria-hidden="true"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function GuestExperience() {
  return (
    <section
      className="w-full bg-[#F5EEE7] py-20 border-y border-[#E7DED7]"
      id="wedding-website"
      aria-labelledby="wedding-website-title"
    >
      <div className="max-w-7xl mx-auto px-5 sm:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          <div className="col-span-1 lg:col-span-5 flex flex-col gap-5">
            <span className="text-xs font-semibold uppercase tracking-widest text-[#6E334E]">
              Guest Journey
              <PlannedBadge />
            </span>
            <h2
              className="font-serif text-3xl sm:text-4xl lg:text-[2.6rem] font-normal text-[#242124] leading-tight"
              id="wedding-website-title"
            >
              Everything your guests need. Nothing they don’t.
            </h2>
            <p className="font-sans text-sm sm:text-base text-[#5C5457] leading-relaxed">
              A bespoke, mobile-friendly invitation and wedding schedule for
              attendees. No clutter, internal tasks, or awkward logins.
            </p>
            <p className="preview-note" id="guest-preview-note">
              Planned for a future release. This sample wedding website and its
              guest actions are a preview.
            </p>
            <div className="flex flex-col gap-3.5 pt-2 font-sans">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-[#6E334E]/10 flex items-center justify-center shrink-0 mt-0.5 text-[#6E334E]">
                  <Navigation
                    className="h-[17px] w-[17px] shrink-0"
                    aria-hidden="true"
                  />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-[#242124]">
                    Multi-venue map navigation
                  </h4>
                  <p className="text-xs text-[#5C5457]">
                    Direct Google Maps routing to every palace, lawn, or mandap
                    venue.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-[#6E334E]/10 flex items-center justify-center shrink-0 mt-0.5 text-[#6E334E]">
                  <Palette
                    className="h-[17px] w-[17px] shrink-0"
                    aria-hidden="true"
                  />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-[#242124]">
                    Ceremony dress palettes
                  </h4>
                  <p className="text-xs text-[#5C5457]">
                    Clear outfit cues and color suggestions for each
                    celebration.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-[#6E334E]/10 flex items-center justify-center shrink-0 mt-0.5 text-[#6E334E]">
                  <ShieldCheck
                    className="h-[17px] w-[17px] shrink-0"
                    aria-hidden="true"
                  />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-[#242124]">
                    Instant RSVP confirmation
                  </h4>
                  <p className="text-xs text-[#5C5457]">
                    Guests confirm attendance and dietary preferences with a
                    single tap.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="col-span-1 lg:col-span-7 flex justify-center">
            <div className="w-full max-w-sm">
              <div className="bg-[#FFFDFC] border-2 border-[#E7DED7] rounded-[36px] p-4 shadow-2xl flex flex-col gap-4 font-sans">
                <div className="relative w-full rounded-2xl overflow-hidden aspect-[4/3] bg-[#FBF7F2]">
                  <Image
                    alt="Sample couple Anya and Kabir in ivory and blush wedding attire"
                    className="w-full h-full object-cover object-[center_30%]"
                    src="/images/sample-couple.webp"
                    loading="eager"
                    width={896}
                    height={1200}
                    sizes="(min-width: 640px) 350px, 85vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#242124]/85 via-black/20 to-transparent" />
                  <div className="absolute bottom-3 left-3 right-3 text-white">
                    <h3 className="font-serif text-lg font-medium">
                      Anya &amp; Kabir
                    </h3>
                    <p className="text-[11px] text-[#D6BE91] font-sans">
                      February 18 – 21, 2027 • Udaipur
                    </p>
                  </div>
                </div>
                <div className="py-1.5 px-3 rounded-full bg-[#F5EEE7] text-center text-xs text-[#242124] font-medium border border-[#E7DED7]/60">
                  50 Days Until We Celebrate
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[#5C5457]">
                    Your Wedding Schedule
                  </span>
                  <div className="p-2.5 rounded-xl bg-[#FBF7F2] border border-[#E7DED7]/60 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-medium text-[#242124]">
                        Mehendi Sundowner
                      </div>
                      <div className="text-[11px] text-[#5C5457]">
                        Feb 18 • 4:00 PM
                      </div>
                    </div>
                    <span className="text-[11px] text-[#5C5457]">
                      Courtyard
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#FBF7F2] border border-[#E7DED7]/60 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-medium text-[#242124]">
                        Sangeet Gala
                      </div>
                      <div className="text-[11px] text-[#5C5457]">
                        Feb 19 • 7:30 PM
                      </div>
                    </div>
                    <span className="text-[11px] text-[#5C5457]">Ballroom</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#FBF7F2] border border-[#E7DED7]/60 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-medium text-[#242124]">
                        Wedding Ceremony
                      </div>
                      <div className="text-[11px] text-[#5C5457]">
                        Feb 20 • 6:00 PM
                      </div>
                    </div>
                    <span className="text-[11px] text-[#5C5457]">
                      Palace Mandap
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 pt-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[#5C5457]">
                    Ceremony Color Palette
                  </span>
                  <div className="flex items-center gap-2">
                    <span
                      className="w-5 h-5 rounded-full bg-[#F5EEE7] border border-[#E7DED7]"
                      title="Warm Ivory"
                    />
                    <span
                      className="w-5 h-5 rounded-full bg-[#D7B0B8] border border-[#E7DED7]"
                      title="Dusty Rose"
                    />
                    <span
                      className="w-5 h-5 rounded-full bg-[#6E334E] border border-[#E7DED7]"
                      title="Plum"
                    />
                    <span
                      className="w-5 h-5 rounded-full bg-[#D6BE91] border border-[#E7DED7]"
                      title="Champagne"
                    />
                    <span className="text-[11px] text-[#5C5457] ml-1">
                      Pastels to Jewel tones
                    </span>
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-[#FBF7F2] border border-[#E7DED7]/60 flex items-center justify-between text-xs text-[#242124] hover:border-[#6E334E] transition-colors">
                  <div className="flex items-center gap-2">
                    <MapPin
                      className="text-[#6E334E] h-[18px] w-[18px] shrink-0"
                      aria-hidden="true"
                    />
                    <div>
                      <div className="font-medium">
                        The Jagmandir Island Palace
                      </div>
                      <div className="text-[11px] text-[#5C5457]">
                        Udaipur, Rajasthan
                      </div>
                    </div>
                  </div>
                  <button
                    className="text-[11px] font-semibold text-[#6E334E]"
                    type="button"
                    disabled
                    aria-describedby="guest-preview-note"
                    title="Guest map navigation is planned for a future release."
                  >
                    Open in Maps →
                  </button>
                </div>
                <button
                  className="w-full bg-[#6E334E] hover:bg-[#542439] text-white text-xs font-semibold py-3 rounded-full transition-all shadow-sm"
                  type="button"
                  disabled
                  aria-describedby="guest-preview-note"
                  title="Guest RSVP is planned for a future release."
                >
                  RSVP Now
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section
      className="w-full max-w-7xl mx-auto px-5 sm:px-8 py-20"
      id="how-it-works"
      aria-labelledby="how-it-works-title"
    >
      <div className="flex flex-col gap-12">
        <div className="text-center max-w-xl mx-auto flex flex-col gap-3">
          <span className="text-xs font-semibold uppercase tracking-widest text-[#6E334E]">
            Effortless Steps
          </span>
          <h2
            className="font-serif text-3xl sm:text-4xl font-normal text-[#242124]"
            id="how-it-works-title"
          >
            From “we’re getting married” to wedding day.
          </h2>
          <p className="font-sans text-sm text-[#5C5457]">
            Three intuitive steps to build your custom wedding command center.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative font-sans">
          <div className="bg-[#FFFDFC] border border-[#E7DED7] rounded-2xl p-6 sm:p-7 flex flex-col gap-4 shadow-sm">
            <span className="w-9 h-9 rounded-full bg-[#F5EEE7] border border-[#E7DED7] flex items-center justify-center text-sm font-semibold text-[#6E334E]">
              01
            </span>
            <div>
              <h4 className="text-lg font-semibold text-[#242124]">
                Create your wedding
              </h4>
              <p className="text-xs sm:text-sm text-[#5C5457] mt-1 leading-relaxed">
                Add your date, location and celebrations.
              </p>
            </div>
          </div>
          <div className="bg-[#FFFDFC] border border-[#E7DED7] rounded-2xl p-6 sm:p-7 flex flex-col gap-4 shadow-sm">
            <span className="w-9 h-9 rounded-full bg-[#F5EEE7] border border-[#E7DED7] flex items-center justify-center text-sm font-semibold text-[#6E334E]">
              02
            </span>
            <div>
              <h4 className="text-lg font-semibold text-[#242124]">
                Bring everyone together
              </h4>
              <p className="text-xs sm:text-sm text-[#5C5457] mt-1 leading-relaxed">
                Invite family and organize responsibilities.
              </p>
            </div>
          </div>
          <div className="bg-[#FFFDFC] border border-[#E7DED7] rounded-2xl p-6 sm:p-7 flex flex-col gap-4 shadow-sm">
            <span className="w-9 h-9 rounded-full bg-[#F5EEE7] border border-[#E7DED7] flex items-center justify-center text-sm font-semibold text-[#6E334E]">
              03
            </span>
            <div>
              <h4 className="text-lg font-semibold text-[#242124]">
                Plan with confidence
              </h4>
              <p className="text-xs sm:text-sm text-[#5C5457] mt-1 leading-relaxed">
                Manage events, tasks, guests and important details.
                <span className="mt-2 block text-[11px]">
                  Guest management
                  <PlannedBadge />
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CulturalFit() {
  return (
    <section
      className="w-full bg-[#F5EEE7] py-20 border-y border-[#E7DED7]"
      id="indian-weddings"
      aria-labelledby="indian-weddings-title"
    >
      <div className="max-w-7xl mx-auto px-5 sm:px-8 flex flex-col gap-10">
        <div className="max-w-3xl flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-[#6E334E]">
            Cultural Fit
          </span>
          <h2
            className="font-serif text-3xl sm:text-4xl font-normal text-[#242124]"
            id="indian-weddings-title"
          >
            Built around how Indian weddings actually happen.
          </h2>
          <p className="font-sans text-sm sm:text-base text-[#5C5457]">
            Structured for multi-day scale, multi-generational families, and
            distinct community traditions.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-sans">
          <div className="bg-[#FFFDFC] border border-[#E7DED7] rounded-2xl p-6 sm:p-7 flex flex-col gap-3 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-[#F5EEE7] flex items-center justify-center text-[#6E334E]">
              <CalendarDays
                className="h-[24px] w-[24px] shrink-0"
                aria-hidden="true"
              />
            </div>
            <h4 className="text-lg font-semibold text-[#242124] pt-1">
              Your ceremonies
            </h4>
            <p className="text-xs sm:text-sm text-[#5C5457] leading-relaxed">
              Organize every celebration and make room for your traditions, from
              Haldi to Phere.
            </p>
          </div>
          <div className="bg-[#FFFDFC] border border-[#E7DED7] rounded-2xl p-6 sm:p-7 flex flex-col gap-3 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-[#F5EEE7] flex items-center justify-center text-[#6E334E]">
              <Building2
                className="h-[24px] w-[24px] shrink-0"
                aria-hidden="true"
              />
            </div>
            <h4 className="text-lg font-semibold text-[#242124] pt-1">
              Your venues
            </h4>
            <p className="text-xs sm:text-sm text-[#5C5457] leading-relaxed">
              Keep dates, times and locations clear across different venues and
              travel transfers.
            </p>
          </div>
          <div className="bg-[#FFFDFC] border border-[#E7DED7] rounded-2xl p-6 sm:p-7 flex flex-col gap-3 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-[#F5EEE7] flex items-center justify-center text-[#6E334E]">
              <UsersRound
                className="h-[24px] w-[24px] shrink-0"
                aria-hidden="true"
              />
            </div>
            <h4 className="text-lg font-semibold text-[#242124] pt-1">
              Your family
            </h4>
            <p className="text-xs sm:text-sm text-[#5C5457] leading-relaxed">
              Bring everyone together with clear responsibilities, so everyone
              knows how they can help.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Privacy() {
  return (
    <section
      className="w-full max-w-7xl mx-auto px-5 sm:px-8 py-20"
      id="privacy"
      aria-labelledby="privacy-title"
    >
      <div className="flex flex-col gap-10">
        <div className="text-center max-w-xl mx-auto flex flex-col gap-3">
          <span className="text-xs font-semibold uppercase tracking-widest text-[#6E334E]">
            Privacy First
          </span>
          <h2
            className="font-serif text-3xl sm:text-4xl font-normal text-[#242124]"
            id="privacy-title"
          >
            Your wedding. Your people. Your information.
          </h2>
          <p className="font-sans text-sm text-[#5C5457]">
            Weddings are personal celebrations. We keep your family details
            protected.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-sans">
          <div className="bg-[#FFFDFC] border border-[#E7DED7] rounded-xl p-5 flex flex-col gap-2 shadow-sm">
            <LockKeyhole
              className="text-[#6E334E] h-[24px] w-[24px] shrink-0"
              aria-hidden="true"
            />
            <h4 className="text-base font-semibold text-[#242124] mt-1">
              Private planning workspace
            </h4>
            <p className="text-xs text-[#5C5457] leading-relaxed">
              Your details are exclusively visible to you and the people you
              directly invite.
            </p>
          </div>
          <div className="bg-[#FFFDFC] border border-[#E7DED7] rounded-xl p-5 flex flex-col gap-2 shadow-sm">
            <UserRoundCog
              className="text-[#6E334E] h-[24px] w-[24px] shrink-0"
              aria-hidden="true"
            />
            <h4 className="text-base font-semibold text-[#242124] mt-1">
              Role-based family access
            </h4>
            <p className="text-xs text-[#5C5457] leading-relaxed">
              Give family members access based on their role so sensitive
              details stay private.
            </p>
          </div>
          <div className="bg-[#FFFDFC] border border-[#E7DED7] rounded-xl p-5 flex flex-col gap-2 shadow-sm">
            <EyeOff
              className="text-[#6E334E] h-[24px] w-[24px] shrink-0"
              aria-hidden="true"
            />
            <h4 className="text-base font-semibold text-[#242124] mt-1">
              Finance permissions
              <PlannedBadge />
            </h4>
            <p className="text-xs text-[#5C5457] leading-relaxed">
              Financial details stay private to authorized members.
            </p>
          </div>
          <div className="bg-[#FFFDFC] border border-[#E7DED7] rounded-xl p-5 flex flex-col gap-2 shadow-sm">
            <ShieldCheck
              className="text-[#6E334E] h-[24px] w-[24px] shrink-0"
              aria-hidden="true"
            />
            <h4 className="text-base font-semibold text-[#242124] mt-1">
              Secure guest information
              <PlannedBadge />
            </h4>
            <p className="text-xs text-[#5C5457] leading-relaxed">
              Dietary preferences, addresses, and RSVPs stay confidential and
              organized.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Closing() {
  return (
    <section
      className="w-full bg-[#F5EEE7] py-20 border-t border-[#E7DED7]"
      id="start"
      aria-labelledby="start-title"
    >
      <div className="max-w-4xl mx-auto px-5 sm:px-8 text-center flex flex-col items-center gap-6">
        <h2
          className="font-serif text-4xl sm:text-5xl font-normal text-[#242124] leading-tight"
          id="start-title"
        >
          Plan every moment.
          <br />
          <span className="italic text-[#6E334E]">Enjoy every memory.</span>
        </h2>
        <p className="font-sans text-sm sm:text-base text-[#5C5457] max-w-lg leading-relaxed">
          Bring every detail together, so you can enjoy the celebrations ahead.
        </p>
        <div className="pt-2">
          <Link
            className="inline-flex items-center justify-center bg-[#6E334E] hover:bg-[#542439] text-white font-sans text-sm font-medium px-8 py-3.5 rounded-full transition-all shadow-sm"
            href="/register"
          >
            Start Planning Your Wedding
          </Link>
        </div>
        <p className="preview-note">
          Start with your account and email verification.
        </p>
      </div>
    </section>
  );
}

function HomepageFooter() {
  return (
    <footer className="w-full bg-[#FBF7F2] border-t border-[#E7DED7] py-12">
      <div className="max-w-7xl mx-auto px-5 sm:px-8 flex flex-col gap-10">
        <div className="flex flex-col md:flex-row items-start justify-between gap-8 pb-8 border-b border-[#E7DED7]/70">
          <div className="flex flex-col gap-2 max-w-xs">
            <Brand />
            <p className="text-xs text-[#5C5457] leading-relaxed">
              Plan every moment. Enjoy every memory.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-8 sm:gap-12 w-full md:w-auto font-sans">
            <div className="flex flex-col gap-2.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#242124]">
                Product
              </span>
              <a
                className="text-xs text-[#5C5457] hover:text-[#6E334E] transition-colors"
                href="#features"
              >
                Features
              </a>
              <a
                className="text-xs text-[#5C5457] hover:text-[#6E334E] transition-colors"
                href="#how-it-works"
              >
                How It Works
              </a>
              <a
                className="text-xs text-[#5C5457] hover:text-[#6E334E] transition-colors"
                href="#wedding-website"
              >
                Wedding Website
              </a>
            </div>
            <div className="flex flex-col gap-2.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#242124]">
                Company
              </span>
              <button
                className="text-xs text-[#5C5457] hover:text-[#6E334E] transition-colors"
                type="button"
                disabled
                aria-describedby="footer-pages-note"
                title="About is not available yet."
              >
                About
              </button>
              <button
                className="text-xs text-[#5C5457] hover:text-[#6E334E] transition-colors"
                type="button"
                disabled
                aria-describedby="footer-pages-note"
                title="Contact is not available yet."
              >
                Contact
              </button>
            </div>
            <div className="flex flex-col gap-2.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#242124]">
                Legal
              </span>
              <button
                className="text-xs text-[#5C5457] hover:text-[#6E334E] transition-colors"
                type="button"
                disabled
                aria-describedby="footer-pages-note"
                title="Privacy is not available yet."
              >
                Privacy
              </button>
              <button
                className="text-xs text-[#5C5457] hover:text-[#6E334E] transition-colors"
                type="button"
                disabled
                aria-describedby="footer-pages-note"
                title="Terms is not available yet."
              >
                Terms
              </button>
            </div>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#5C5457] font-sans">
          <span>© 2026 Make My Marriage. All rights reserved.</span>
          <span className="font-serif italic text-[#5C5457]">
            Calm coordination for celebrated traditions.
          </span>
        </div>
        <p className="preview-note" id="footer-pages-note">
          About, contact, privacy and terms pages are planned.
        </p>
      </div>
    </footer>
  );
}

export function Homepage() {
  const fontClassName = [inter.variable, playfair.variable].join(' ');
  return (
    <div
      id="top"
      className={[
        styles.page,
        fontClassName,
        'min-h-screen antialiased selection:bg-[#D7B0B8]/30 selection:text-[#6E334E]',
      ].join(' ')}
    >
      <HomepageHeader fontClassName={fontClassName} />
      <main id="main-content" className="w-full pt-20">
        <Hero />
        <Clarity />
        <Features />
        <Celebrations />
        <Family />
        <GuestExperience />
        <HowItWorks />
        <CulturalFit />
        <Privacy />
        <Closing />
      </main>
      <HomepageFooter />
    </div>
  );
}
