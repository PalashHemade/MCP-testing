import { useQuery } from '@tanstack/react-query'
import { listTools } from '../api/tools'

export function useTools(demoUser: string) {
  return useQuery({
    queryKey: ['tools', demoUser],
    queryFn: () => listTools(demoUser),
    staleTime: 5 * 60 * 1000,
  })
}
