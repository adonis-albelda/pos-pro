"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  clockIn,
  clockOut,
  correctAttendance,
  createScheduleAssignment,
  createWorkSchedule,
  deleteScheduleAssignment,
  deleteWorkSchedule,
  endBreak,
  getAttendanceSettings,
  getMyTodayAttendance,
  listAttendance,
  listScheduleAssignments,
  listWorkSchedules,
  materializeAttendance,
  startBreak,
  updateAttendanceSettings,
  updateScheduleAssignment,
  updateWorkSchedule,
  type AttendanceFilter,
  type CorrectAttendanceInput,
  type UpsertScheduleAssignmentInput,
  type UpsertWorkScheduleInput,
} from "@double-a/api-client/queries";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { queryKeys } from "./keys";

export function useWorkSchedules() {
  return useQuery({
    queryKey: queryKeys.workSchedules.list(),
    queryFn: () => listWorkSchedules(getBrowserApiClient()),
  });
}

export function useCreateWorkSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertWorkScheduleInput) => createWorkSchedule(getBrowserApiClient(), input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.workSchedules.all }),
  });
}

export function useUpdateWorkSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<UpsertWorkScheduleInput> }) =>
      updateWorkSchedule(getBrowserApiClient(), id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.workSchedules.all }),
  });
}

export function useDeleteWorkSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteWorkSchedule(getBrowserApiClient(), id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.workSchedules.all }),
  });
}

export function useScheduleAssignments(userId?: string) {
  return useQuery({
    queryKey: queryKeys.scheduleAssignments.list(userId),
    queryFn: () => listScheduleAssignments(getBrowserApiClient(), { userId }),
  });
}

export function useCreateScheduleAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertScheduleAssignmentInput) => createScheduleAssignment(getBrowserApiClient(), input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.scheduleAssignments.all }),
  });
}

export function useUpdateScheduleAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Omit<UpsertScheduleAssignmentInput, "userId">> }) =>
      updateScheduleAssignment(getBrowserApiClient(), id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.scheduleAssignments.all }),
  });
}

export function useDeleteScheduleAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteScheduleAssignment(getBrowserApiClient(), id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.scheduleAssignments.all }),
  });
}

export function useAttendanceSettings() {
  return useQuery({
    queryKey: queryKeys.attendanceSettings.detail(),
    queryFn: () => getAttendanceSettings(getBrowserApiClient()),
  });
}

export function useUpdateAttendanceSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enforcementEnabled: boolean) => updateAttendanceSettings(getBrowserApiClient(), enforcementEnabled),
    onSuccess: (settings) => {
      queryClient.setQueryData(queryKeys.attendanceSettings.detail(), settings);
    },
  });
}

/** Backs both the Today's Attendance dashboard and history — pass a date, or from/to for a range. */
export function useAttendance(filter: AttendanceFilter = {}) {
  return useQuery({
    queryKey: queryKeys.attendance.list({ ...filter }),
    queryFn: () => listAttendance(getBrowserApiClient(), filter),
    placeholderData: (previous) => previous,
  });
}

export function useMaterializeAttendance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, date }: { userId: string; date: string }) =>
      materializeAttendance(getBrowserApiClient(), userId, date),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.attendance.all }),
  });
}

export function useCorrectAttendance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CorrectAttendanceInput }) =>
      correctAttendance(getBrowserApiClient(), id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.attendance.all }),
  });
}

/** POS-side hooks — clock actions act on an explicit user_id (the PIN-verified cashier), not the calling session. */
export function useMyTodayAttendance(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.attendance.today(userId ?? ""),
    queryFn: () => getMyTodayAttendance(getBrowserApiClient(), userId!),
    enabled: Boolean(userId),
  });
}

export function useClockIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, locationId }: { userId: string; locationId?: string | null }) =>
      clockIn(getBrowserApiClient(), userId, locationId),
    onSuccess: (_, { userId }) => queryClient.invalidateQueries({ queryKey: queryKeys.attendance.today(userId) }),
  });
}

export function useStartBreak() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => startBreak(getBrowserApiClient(), userId),
    onSuccess: (_, userId) => queryClient.invalidateQueries({ queryKey: queryKeys.attendance.today(userId) }),
  });
}

export function useEndBreak() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => endBreak(getBrowserApiClient(), userId),
    onSuccess: (_, userId) => queryClient.invalidateQueries({ queryKey: queryKeys.attendance.today(userId) }),
  });
}

export function useClockOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => clockOut(getBrowserApiClient(), userId),
    onSuccess: (_, userId) => queryClient.invalidateQueries({ queryKey: queryKeys.attendance.today(userId) }),
  });
}
