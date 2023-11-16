
function getCommandType(text: string) {
    if (text.toLowerCase().indexOf('create') !== -1) {
        return 'create';
    } else {
        return 'modify';
    }
}

export function getCommandWithType(text: string) {
    let type = getCommandType(text);
    return {
        'text': text,
        'type': type,
    };
}

export async function parse(text: string): Promise<string[]> {
    // Parse text into commands (each command starts with a '#'). Commands can have multiple lines (Before the next command starts).
    let lines = text.split('\n');
    let commands: string[] = [];
    let currentCommand: string[] = [];
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        if (line.startsWith('#')) {
            if (currentCommand.length > 0) {
                commands.push(currentCommand.join('\n'));
            }
            currentCommand = [];
            currentCommand.push(line);
        } else {
            currentCommand.push(line);
        }
    }
    if (currentCommand.length > 0) {
        if (!currentCommand[0].startsWith('#')) {
            throw new Error('Command line must start with a "#"');
        }
        commands.push(currentCommand.join('\n'));
    }
    // Remove # from commands
    commands = commands.map(command => command.replace('#', '').trim());
    return commands;
}