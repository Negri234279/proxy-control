type Level = 'info' | 'warn' | 'error'

type Context = Record<string, unknown>

// Logs estructurados JSON a stdout/stderr (los recoge Alloy). Una línea por evento.
function emit(level: Level, message: string, context?: Context): void {
    const line = JSON.stringify({
        ts: new Date().toISOString(),
        level,
        message,
        ...context,
    })

    if (level === 'error') {
        console.error(line)
    } else {
        console.log(line)
    }
}

export const logger = {
    info: (message: string, context?: Context) => emit('info', message, context),
    warn: (message: string, context?: Context) => emit('warn', message, context),
    error: (message: string, context?: Context) => emit('error', message, context),
}
