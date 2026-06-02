"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { moduleLibrary } from "@/lib/moduleLibrary";
import { createSupabaseServerClient } from "@/lib/supabaseClient";

type CompletedActionRow = {
  id?: string;
  user_id?: string;
  route_id?: string;
  module_id?: string | null;
  module_name?: string | null;
  completed_at?: string | null;
  feedback_emoji?: string | null;
  rating?: string | null;
};

type GroupKey = "today" | "yesterday" | "earlier";

const moduleNameById = new Map(moduleLibrary.map((module) => [module.id, module.name]));

export default function HistoryPage() {
  const router = useRouter();
  const [records, setRecords] = useState<CompletedActionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const anonymousId = localStorage.getItem("anonymous_id");

    if (!anonymousId) {
      router.replace("/");
      return;
    }

    const fetchHistory = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const supabase = createSupabaseServerClient();
        const { data, error: queryError } = await supabase
          .from("completed_actions")
          .select("*")
          .eq("user_id", anonymousId)
          .order("completed_at", { ascending: false });

        if (queryError) {
          throw queryError;
        }

        setRecords((data ?? []) as CompletedActionRow[]);
      } catch (caughtError) {
        console.error("history query error:", caughtError);
        setError("暂时读不到历史轨迹，请稍后再试");
      } finally {
        setIsLoading(false);
      }
    };

    void fetchHistory();
  }, [router]);

  const groupedRecords = useMemo(() => groupRecords(records), [records]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#fbfaf7] px-5 text-[#655b52]">
        读取历史轨迹中...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#fbfaf7] px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 flex flex-col gap-4 border-b border-[#eee5dc] pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-[#8a8178]">History</p>
            <h1 className="mt-2 text-4xl font-light text-[#29231f]">
              历史轨迹
            </h1>
          </div>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[#ded3c8] bg-white px-4 text-sm font-medium text-[#433b34] transition hover:border-[#2e4d48] hover:text-[#2e4d48]"
          >
            回到首页
          </Link>
        </header>

        {error ? (
          <div className="rounded-lg border border-[#eadfd4] bg-white p-5 text-sm text-[#655b52] shadow-sm">
            {error}
          </div>
        ) : null}

        {!error && records.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-8">
            <TimelineGroup
              label="今天"
              records={groupedRecords.today}
            />
            <TimelineGroup
              label="昨天"
              records={groupedRecords.yesterday}
            />
            <TimelineGroup
              label="更早"
              records={groupedRecords.earlier}
            />
          </div>
        )}
      </div>
    </main>
  );
}

function TimelineGroup({
  label,
  records,
}: {
  label: string;
  records: CompletedActionRow[];
}) {
  if (records.length === 0) {
    return null;
  }

  return (
    <section className="grid gap-4 sm:grid-cols-[104px_1fr]">
      <div className="text-sm font-medium text-[#8a8178] sm:pt-4">{label}</div>
      <div className="relative space-y-3 border-l border-[#e4d8ca] pl-4">
        {records.map((record, index) => (
          <article
            key={record.id ?? `${record.route_id}-${record.module_id}-${record.completed_at}-${index}`}
            className="relative min-h-11 rounded-lg border border-[#e8ded2] bg-white p-4 shadow-sm"
          >
            <span className="absolute -left-[21px] top-5 h-3 w-3 rounded-full border-2 border-[#fbfaf7] bg-[#d9952f]" />
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-medium text-[#29231f]">
                  {getModuleName(record)}
                </h2>
                <p className="mt-1 text-sm text-[#8a8178]">
                  {formatTime(record.completed_at)}
                </p>
              </div>
              {getFeedbackEmoji(record) ? (
                <span className="flex h-11 min-w-11 items-center justify-center rounded-full bg-[#fff3db] text-lg">
                  {getFeedbackEmoji(record)}
                </span>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-[#eadfd4] bg-white p-7 text-center shadow-sm">
      <p className="text-lg font-light text-[#29231f]">
        还没有完成任何模块，去今晚计划试试吧
      </p>
      <Link
        href="/"
        className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg bg-[#2e4d48] px-5 text-sm font-medium text-white transition hover:bg-[#243f3b]"
      >
        回到首页
      </Link>
    </div>
  );
}

function groupRecords(records: CompletedActionRow[]) {
  const grouped: Record<GroupKey, CompletedActionRow[]> = {
    today: [],
    yesterday: [],
    earlier: [],
  };

  for (const record of records) {
    grouped[getGroupKey(record.completed_at)].push(record);
  }

  return grouped;
}

function getGroupKey(value: string | null | undefined): GroupKey {
  if (!value) {
    return "earlier";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "earlier";
  }

  const today = startOfDay(new Date());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const target = startOfDay(date);

  if (target.getTime() === today.getTime()) {
    return "today";
  }

  if (target.getTime() === yesterday.getTime()) {
    return "yesterday";
  }

  return "earlier";
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getModuleName(record: CompletedActionRow) {
  if (record.module_name) {
    return record.module_name;
  }

  if (record.module_id) {
    return moduleNameById.get(record.module_id) ?? record.module_id;
  }

  return "完成了一个模块";
}

function formatTime(value: string | null | undefined) {
  if (!value) {
    return "时间未知";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "时间未知";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(date);
}

function getFeedbackEmoji(record: CompletedActionRow) {
  if (record.feedback_emoji) {
    return record.feedback_emoji;
  }

  if (record.rating === "useful" || record.rating === "有用") {
    return "👍";
  }

  if (record.rating === "一般") {
    return "😐";
  }

  if (record.rating === "不太适合") {
    return "🙂";
  }

  return null;
}
