import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import type { Dashboard } from '@/lib/types';

export const useDashboard = () => useQuery({ queryKey: ['dashboard'], queryFn: () => get<Dashboard>('/dashboard') });
