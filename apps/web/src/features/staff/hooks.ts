"use client";

import type { CreateEmployeeInput, StaffList, UpdateEmployeeInput } from "@restoos/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createEmployee, listStaff, setEmployeePin, updateEmployee } from "./api";

export const staffKey = (outletId: string) => ["staff", outletId] as const;

export function useStaff(outletId: string, initialData: StaffList) {
  return useQuery({
    queryKey: staffKey(outletId),
    queryFn: () => listStaff(outletId),
    initialData,
  });
}

function useInvalidate(outletId: string) {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: staffKey(outletId) });
}

export function useCreateEmployee(outletId: string) {
  const onSuccess = useInvalidate(outletId);
  return useMutation({
    mutationFn: (body: CreateEmployeeInput) => createEmployee(outletId, body),
    onSuccess,
  });
}

export function useUpdateEmployee(outletId: string) {
  const onSuccess = useInvalidate(outletId);
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateEmployeeInput }) =>
      updateEmployee(outletId, id, body),
    onSuccess,
  });
}

export function useSetPin(outletId: string) {
  return useMutation({
    mutationFn: ({ id, pin }: { id: string; pin: string }) => setEmployeePin(outletId, id, pin),
  });
}
