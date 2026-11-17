"use client";

import type { Device, RegisterDeviceInput } from "@restoos/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listDevices, newPairingCode, registerDevice, unpairDevice } from "./api";

export const devicesKey = (outletId: string) => ["devices", outletId] as const;

export function useDevices(outletId: string, initialData: { devices: Device[] }) {
  return useQuery({
    queryKey: devicesKey(outletId),
    queryFn: () => listDevices(outletId),
    initialData,
  });
}

function useInvalidate(outletId: string) {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: devicesKey(outletId) });
}

export function useRegisterDevice(outletId: string) {
  const onSuccess = useInvalidate(outletId);
  return useMutation({
    mutationFn: (body: RegisterDeviceInput) => registerDevice(outletId, body),
    onSuccess,
  });
}

export function useNewPairingCode(outletId: string) {
  return useMutation({ mutationFn: (id: string) => newPairingCode(outletId, id) });
}

export function useUnpairDevice(outletId: string) {
  const onSuccess = useInvalidate(outletId);
  return useMutation({ mutationFn: (id: string) => unpairDevice(outletId, id), onSuccess });
}
