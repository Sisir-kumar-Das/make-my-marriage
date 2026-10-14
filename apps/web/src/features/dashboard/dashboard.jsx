import Link from 'next/link';
import {
  CalendarDays,
  MapPin,
  ArrowUpRight,
  Plus,
  UserPlus,
  Circle,
  CircleCheck,
  Clock3,
  AlertCircle,
  Heart,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { ApiStatus } from './api-status';
import {
  sampleWedding,
  sampleProgress,
  sampleSummary,
  sampleTasks,
  sampleEvents,
  sampleAttention,
  sampleActivity,
} from './sample-data';

export function Dashboard() {
  const summaries = [
    {
      label: 'To do',
      value: sampleSummary.todo,
      icon: Circle,
      color: 'text-primary',
    },
    {
      label: 'In progress',
      value: sampleSummary.inProgress,
      icon: Clock3,
      color: 'text-warning',
    },
    {
      label: 'Completed',
      value: sampleSummary.completed,
      icon: CircleCheck,
      color: 'text-success',
    },
    {
      label: 'Overdue',
      value: sampleSummary.overdue,
      icon: AlertCircle,
      color: 'text-warning',
    },
  ];

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="mb-2 text-[10px] font-semibold tracking-[0.2em] text-primary uppercase">
            Together, one step at a time
          </p>
          <h1 className="font-serif text-3xl leading-tight sm:text-4xl">
            Your wedding, taking shape.
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            A calm overview of everything you’re bringing together.
          </p>
        </div>
        <Button asChild>
          <Link href="/tasks">
            <Plus className="size-4" />
            Add task
          </Link>
        </Button>
      </div>

      <Card className="overflow-hidden border-primary/10 bg-sidebar shadow-none">
        <CardContent className="grid gap-7 py-7 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <p className="mb-3 text-[10px] font-semibold tracking-[0.2em] text-muted-foreground uppercase">
              Sample wedding overview
            </p>
            <h2 className="font-serif text-3xl text-primary">
              {sampleWedding.couple}
            </h2>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-2">
                <CalendarDays className="size-3.5" aria-hidden="true" />
                {sampleWedding.date}
              </span>
              <span className="flex items-center gap-2">
                <MapPin className="size-3.5" aria-hidden="true" />
                {sampleWedding.location}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4 rounded-xl border border-primary/10 bg-card/70 px-5 py-4">
            <Heart className="size-8 text-primary/50" aria-hidden="true" />
            <div>
              <p className="font-serif text-3xl text-primary">
                120{' '}
                <span className="font-sans text-xs text-muted-foreground">
                  days
                </span>
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Illustrative sample countdown
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1fr_1.3fr]">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="font-serif text-xl font-normal">
              Good things are coming together
            </CardTitle>
            <CardDescription>Sample planning progress</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex items-end justify-between gap-3">
              <p className="font-serif text-4xl text-primary">
                {sampleProgress.percent}
                <span className="text-xl">%</span>
              </p>
              <p className="pb-1 text-xs text-muted-foreground">
                {sampleProgress.completed} of {sampleProgress.total} tasks
                complete
              </p>
            </div>
            <progress
              className="planning-progress"
              value={sampleProgress.percent}
              max="100"
              aria-label="Sample planning progress"
            >
              {sampleProgress.percent}%
            </progress>
            <p className="mt-4 text-xs text-muted-foreground">
              Small steps make room for the big moments.
            </p>
          </CardContent>
        </Card>
        <div className="grid grid-cols-2 gap-4">
          {summaries.map(({ label, value, icon: Icon, color }) => (
            <Card key={label} className="gap-3 shadow-none">
              <CardContent>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <Icon className={`size-4 ${color}`} aria-hidden="true" />
                </div>
                <p className="text-2xl font-medium">{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[1.15fr_1fr]">
        <Card className="shadow-none">
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle className="font-serif text-xl font-normal">
                My tasks
              </CardTitle>
              <CardDescription className="mt-1">
                Sample priorities for the days ahead
              </CardDescription>
            </div>
            <Link
              href="/tasks"
              className="shrink-0 text-xs font-semibold text-primary"
            >
              View all <span aria-hidden="true">→</span>
            </Link>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {sampleTasks.map((task) => (
                <li
                  key={task.id}
                  className="flex items-start gap-3 py-4 first:pt-0 last:pb-0"
                >
                  <Circle
                    className="mt-0.5 size-4 shrink-0 text-border"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{task.title}</p>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {task.detail} · {task.status}
                    </p>
                  </div>
                  <Badge
                    variant="secondary"
                    className={
                      task.priority === 'High'
                        ? 'bg-warning-soft text-warning'
                        : ''
                    }
                  >
                    {task.priority}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle className="font-serif text-xl font-normal">
                Upcoming events
              </CardTitle>
              <CardDescription className="mt-1">
                Sample celebrations on your calendar
              </CardDescription>
            </div>
            <Link
              href="/events"
              className="shrink-0 text-xs font-semibold text-primary"
            >
              View all <span aria-hidden="true">→</span>
            </Link>
          </CardHeader>
          <CardContent>
            <ul className="space-y-5">
              {sampleEvents.map((event) => (
                <li key={event.id} className="flex gap-3">
                  <div className="flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-muted">
                    <span className="text-[9px] font-semibold tracking-widest text-muted-foreground">
                      {event.month}
                    </span>
                    <span className="font-serif text-xl">{event.day}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{event.name}</p>
                      <Badge
                        variant="secondary"
                        className={
                          event.status === 'Confirmed'
                            ? 'bg-success-soft text-success'
                            : ''
                        }
                      >
                        {event.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {event.date} · {event.time} IST
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {event.venue}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[1.15fr_1fr]">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="font-serif text-xl font-normal">
              A little attention needed
            </CardTitle>
            <CardDescription>Sample planning reminders</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {sampleAttention.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className="flex items-start gap-3 rounded-lg bg-warning-soft/60 p-3.5 transition-colors hover:bg-warning-soft"
                  >
                    <AlertCircle
                      className="mt-0.5 size-4 shrink-0 text-warning"
                      aria-hidden="true"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.detail}
                      </p>
                    </div>
                    <ArrowUpRight
                      className="size-4 shrink-0 text-warning"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="font-serif text-xl font-normal">
              Planning, together
            </CardTitle>
            <CardDescription>Sample recent activity</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-5">
              {sampleActivity.map((item) => (
                <li key={item.id} className="flex gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-primary">
                    {item.initials}
                  </span>
                  <div>
                    <p className="text-xs leading-relaxed">{item.text}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {item.time}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <p className="mr-1 text-xs text-muted-foreground">Quick actions</p>
        <Button asChild variant="outline" size="sm">
          <Link href="/events">
            <CalendarDays className="size-4" />
            Add event
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/members">
            <UserPlus className="size-4" />
            Invite member
          </Link>
        </Button>
        <span className="text-[10px] text-muted-foreground">
          Opens placeholder pages
        </span>
      </div>
      <ApiStatus />
    </div>
  );
}
