import { QueryClient, type QueryFunction } from '@tanstack/react-query';
import { api } from './api';

/**
 * Дефолтный queryFn: берёт первый элемент queryKey как путь, вызывает api.get.
 * Пример:  useQuery({ queryKey: ['/api/servers'] })
 */
const defaultQueryFn: QueryFunction = async ({ queryKey }) => {
  const path = queryKey[0];
  if (typeof path !== 'string') throw new Error('queryKey[0] должен быть путём');
  return api.get(path);
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: defaultQueryFn,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      retry: false,
    },
    mutations: { retry: false },
  },
});
