export class NotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} no encontrado: ${id}`)
    this.name = 'NotFoundError'
  }
}
