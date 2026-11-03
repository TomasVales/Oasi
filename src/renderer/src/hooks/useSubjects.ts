import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SubjectCreateInput, SubjectUpdateInput } from '@shared/validation'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryClient'

export function useSubjects(includeArchived = false) {
  return useQuery({
    queryKey: queryKeys.subjects(includeArchived),
    queryFn: () => api.subjects.list({ includeArchived })
  })
}

export function useSubjectMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.subjectsAll })

  return {
    create: useMutation({ mutationFn: (input: SubjectCreateInput) => api.subjects.create(input), onSuccess: invalidate }),
    update: useMutation({
      mutationFn: ({ id, patch }: { id: string; patch: SubjectUpdateInput }) => api.subjects.update(id, patch),
      onSuccess: invalidate
    }),
    remove: useMutation({ mutationFn: (id: string) => api.subjects.remove(id), onSuccess: invalidate })
  }
}
