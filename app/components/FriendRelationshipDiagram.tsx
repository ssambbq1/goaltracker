"use client";

import { useState } from "react";

export type DiagramAssignment = {
  id: string;
  assignerId: string;
  assigneeId: string;
  kind: "goal" | "todo" | "routine";
  title: string;
  memo: string;
  status: "pending" | "accepted" | "declined";
  appliedItemId?: string;
  target?: number;
  unit?: string;
  category: string;
  deadline?: string;
  targetDate?: string;
  startDate?: string;
  endDate?: string;
  createdAt: number;
};

type Friend = {
  id: string;
  name: string;
  sent: DiagramAssignment[];
  received: DiagramAssignment[];
};

type Props = {
  me: string;
  friends: Friend[];
  language: "ko" | "en";
  onOpenAccepted: (assignmentId: string) => void;
};

function initials(name: string) {
  return name.trim().slice(0, 2).toUpperCase();
}

function assignmentPeriod(assignment: DiagramAssignment) {
  if (assignment.kind === "routine") return [assignment.startDate, assignment.endDate].filter(Boolean).join(" - ");
  return assignment.kind === "goal" ? assignment.deadline : assignment.targetDate;
}

function assignmentKindLabel(kind: DiagramAssignment["kind"], language: Props["language"]) {
  if (language === "en") return kind === "goal" ? "Goal" : kind === "todo" ? "Task" : "Habit";
  return kind === "goal" ? "목표" : kind === "todo" ? "할 일" : "습관";
}

function assignmentStatusLabel(status: DiagramAssignment["status"], language: Props["language"]) {
  if (language === "en") return status === "pending" ? "Pending" : status === "accepted" ? "Accepted" : "Declined";
  return status === "pending" ? "대기 중" : status === "accepted" ? "수락됨" : "거절됨";
}

export default function FriendRelationshipDiagram({ me, friends, language, onOpenAccepted }: Props) {
  const [selection, setSelection] = useState<{ friendId: string; direction: "sent" | "received" } | null>(null);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const selectedFriend = friends.find((friend) => friend.id === selection?.friendId) ?? null;
  const selectedAssignments = selectedFriend && selection ? selectedFriend[selection.direction] : [];
  const selectedAssignment = selectedAssignments.find((assignment) => assignment.id === selectedAssignmentId) ?? null;
  const diagramHeight = Math.max(300, 200 + Math.ceil(friends.length / 2) * 154);
  const totalSent = friends.reduce((total, friend) => total + friend.sent.length, 0);
  const totalReceived = friends.reduce((total, friend) => total + friend.received.length, 0);

  function select(friendId: string, direction: "sent" | "received") {
    setSelection({ friendId, direction });
    setSelectedAssignmentId(null);
  }

  return (
    <div className="border-t border-stone-200 bg-[#f4f7f5]">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-stone-200 bg-white px-4 py-3 text-xs font-semibold">
        <span className="text-stone-700">{language === "ko" ? "친구" : "Friends"} <strong className="ml-1 text-base text-stone-950">{friends.length}</strong></span>
        <span className="text-emerald-700">{language === "ko" ? "보낸 임무" : "Sent"} <strong className="ml-1 text-base">{totalSent}</strong></span>
        <span className="text-amber-700">{language === "ko" ? "받은 임무" : "Received"} <strong className="ml-1 text-base">{totalReceived}</strong></span>
      </div>
      {friends.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-stone-600">
          {language === "ko" ? "수락된 친구가 아직 없습니다." : "No accepted friends yet."}
        </p>
      ) : (
        <div className="overflow-x-auto [scrollbar-width:thin]">
          <div className="relative mx-auto min-w-[720px] max-w-[960px]" style={{ height: diagramHeight }}>
            <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 720 ${diagramHeight}`} aria-hidden="true" preserveAspectRatio="none">
              <defs>
                <pattern id="relationship-grid" width="24" height="24" patternUnits="userSpaceOnUse">
                  <circle cx="1" cy="1" r="1" fill="#cbd9d2" />
                </pattern>
                <linearGradient id="relationship-link" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#27b293" />
                  <stop offset="1" stopColor="#d59d4b" />
                </linearGradient>
              </defs>
              <rect width="720" height={diagramHeight} fill="url(#relationship-grid)" />
              {friends.map((friend, index) => {
                const x = index % 2 === 0 ? 146 : 574;
                const y = 207 + Math.floor(index / 2) * 154;
                return (
                  <g key={friend.id}>
                    <path d={`M 360 113 C 360 ${y - 42}, ${x} ${y - 42}, ${x} ${y}`} fill="none" stroke="white" strokeWidth="7" />
                    <path d={`M 360 113 C 360 ${y - 42}, ${x} ${y - 42}, ${x} ${y}`} fill="none" stroke="url(#relationship-link)" strokeWidth={Math.min(2 + friend.sent.length + friend.received.length, 5)} strokeLinecap="round" />
                    <circle cx={x} cy={y} r="5" fill="#0d8b73" stroke="white" strokeWidth="3" />
                  </g>
                );
              })}
            </svg>
            <div className="absolute left-1/2 top-7 flex w-48 -translate-x-1/2 items-center gap-3 rounded-lg border border-emerald-500 bg-[#075f53] px-4 py-3 text-white shadow-[0_14px_30px_rgba(4,78,67,0.24)]">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-300 text-sm font-bold text-emerald-950">{initials(me)}</span>
              <span className="min-w-0"><span className="block text-[11px] text-emerald-200">{language === "ko" ? "나" : "Me"}</span><span className="block truncate text-sm font-bold" title={me}>{me}</span></span>
            </div>
            {friends.map((friend, index) => (
              <div
                key={friend.id}
                className={`absolute w-[252px] overflow-hidden rounded-lg border bg-white shadow-[0_8px_24px_rgba(31,60,48,0.11)] transition ${selection?.friendId === friend.id ? "border-emerald-500 ring-2 ring-emerald-200" : "border-stone-200"}`}
                style={{ top: 207 + Math.floor(index / 2) * 154, left: index % 2 === 0 ? "20.3%" : "79.7%", transform: "translate(-50%, 0)" }}
              >
                <div className="flex items-center gap-2.5 border-b border-stone-100 px-3 py-2.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-100 text-xs font-bold text-amber-800">{initials(friend.name)}</span>
                  <span className="min-w-0 truncate text-sm font-bold text-stone-900" title={friend.name}>{friend.name}</span>
                </div>
                <div className="grid grid-cols-2 divide-x divide-stone-100">
                  {(["sent", "received"] as const).map((direction) => (
                    <button
                      key={direction}
                      type="button"
                      onClick={() => select(friend.id, direction)}
                      aria-pressed={selection?.friendId === friend.id && selection.direction === direction}
                      className={`flex items-center justify-between px-3 py-2.5 text-left text-xs font-semibold transition hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-emerald-600 ${direction === "sent" ? "text-emerald-800" : "text-amber-800"}`}
                    >
                      <span>{language === "ko" ? direction === "sent" ? "보냄" : "받음" : direction === "sent" ? "Sent" : "Received"}</span>
                      <span className="text-base font-bold">{friend[direction].length}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {selectedFriend && selection && (
        <div className="border-t border-stone-200 bg-white px-4 py-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="min-w-0 truncate text-sm font-bold text-stone-900">
              {selectedFriend.name} · {language === "ko" ? selection.direction === "sent" ? "보낸 임무" : "받은 임무" : selection.direction === "sent" ? "Sent assignments" : "Received assignments"}
            </h3>
            <button type="button" onClick={() => setSelection(null)} aria-label={language === "ko" ? "목록 닫기" : "Close list"} className="shrink-0 rounded-md border border-stone-300 px-2 py-1 text-xs text-stone-700 hover:bg-stone-100">×</button>
          </div>
          {selectedAssignments.length === 0 ? (
            <p className="py-3 text-sm text-stone-500">{language === "ko" ? "임무가 없습니다." : "No assignments."}</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {selectedAssignments.map((assignment) => (
                <div key={assignment.id} className="min-w-0 rounded-md border border-stone-200 bg-[#fafbf9]">
                  <button
                    type="button"
                    onClick={() => setSelectedAssignmentId((id) => id === assignment.id ? null : assignment.id)}
                    aria-expanded={selectedAssignmentId === assignment.id}
                    className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left hover:bg-emerald-50/60"
                  >
                    <span className="min-w-0 truncate text-sm font-semibold text-stone-900">{assignment.title}</span>
                    <span className="shrink-0 text-xs font-semibold text-stone-600">{assignmentStatusLabel(assignment.status, language)}</span>
                  </button>
                  {selectedAssignment?.id === assignment.id && (
                    <div className="grid gap-2 border-t border-stone-200 px-3 py-3 text-sm text-stone-700">
                      <span>{language === "ko" ? "종류" : "Type"}: {assignmentKindLabel(assignment.kind, language)}</span>
                      <span>{language === "ko" ? "요청일" : "Requested"}: {new Date(assignment.createdAt).toLocaleDateString(language === "ko" ? "ko-KR" : "en-US")}</span>
                      {assignmentPeriod(assignment) && <span>{language === "ko" ? "기간" : "Date"}: {assignmentPeriod(assignment)}</span>}
                      {assignment.kind === "goal" && assignment.target !== undefined && <span>{language === "ko" ? "목표" : "Target"}: {assignment.target} {assignment.unit}</span>}
                      {assignment.kind === "todo" && assignment.category && <span>{language === "ko" ? "분류" : "Category"}: {assignment.category}</span>}
                      {assignment.memo && <p className="whitespace-pre-wrap break-words">{assignment.memo}</p>}
                      {selection.direction === "sent" && assignment.status === "accepted" && assignment.appliedItemId && (
                        <button type="button" onClick={() => onOpenAccepted(assignment.id)} className="justify-self-start rounded-md bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800">
                          {language === "ko" ? "진행 상세" : "Progress detail"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
