import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import type { AppNotification } from '@/lib/types';

export const useNotifications = () =>
  useQuery({
    queryKey: ['notifications'],
    queryFn: () => get<{ notifications: AppNotification[]; unread: number }>('/notifications'),
  });

export const useUnreadNotifications = () => useNotifications().data?.unread ?? 0;
