"use client";

import { UserRole } from "@/generated/prisma";

type UseRoleParams = {
  currentRole?: UserRole | null;
};

export function useRole({ currentRole }: UseRoleParams) {
  const hasRole = (requiredRole: UserRole | UserRole[]) => {
    if (!currentRole) return false;
    const allowedRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    return allowedRoles.includes(currentRole);
  };

  return {
    hasRole,
    isDAF: hasRole(UserRole.DAF),
    isRH: hasRole(UserRole.RH),
    isExploit: hasRole(UserRole.EXPLOIT),
    isSAV: hasRole(UserRole.SAV),
  };
}
