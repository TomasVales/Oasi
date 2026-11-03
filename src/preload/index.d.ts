import type { StudentOSApi } from '@shared/ipc'

declare global {
  interface Window {
    studentOS: StudentOSApi
  }
}

export {}
