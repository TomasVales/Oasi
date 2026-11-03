import { strict as assert } from 'node:assert'
import { existsSync, readdirSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { BackgroundStore } from '../src/main/backgrounds'

let tmp: string
before(async () => (tmp = await mkdtemp(join(tmpdir(), 'sos-bg-'))))
after(async () => rm(tmp, { recursive: true, force: true }))

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')
const GIF = Buffer.concat([Buffer.from('GIF89a', 'ascii'), Buffer.alloc(20)])

describe('fondos personalizados', () => {
  it('acepta por firma, guarda uno solo y lo lee', async () => {
    const store = new BackgroundStore(join(tmp, 'bg'))
    await writeFile(join(tmp, 'foto.png'), PNG)
    await writeFile(join(tmp, 'anim.gif'), GIF)
    const a = await store.import(join(tmp, 'foto.png'))
    assert.equal(a.mime, 'image/png')
    assert.match(a.fileName, /^[0-9a-f]{64}\.png$/)
    const b = await store.import(join(tmp, 'anim.gif'))
    assert.equal(b.mime, 'image/gif')
    assert.deepEqual(readdirSync(join(tmp, 'bg')), [b.fileName]) // el anterior se borró
    assert.deepEqual(Buffer.from(await store.read(b.fileName)), GIF)
  })
  it('rechaza archivos disfrazados y rutas raras', async () => {
    const store = new BackgroundStore(join(tmp, 'bg2'))
    await writeFile(join(tmp, 'falso.png'), 'no soy una imagen')
    await assert.rejects(store.import(join(tmp, 'falso.png')), /Formato no soportado/)
    await assert.rejects(store.read('../../etc/passwd'), /inválido/)
    await store.clear()
    assert.equal(existsSync(join(tmp, 'bg2')), false)
  })
})
