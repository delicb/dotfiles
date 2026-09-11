function herdr --description 'Run Herdr with Ghostty key mode'
    set -l ghostty_terminal_id

    if test "$TERM_PROGRAM" = ghostty; and command -q osascript; and not set -q HERDR_ENV
        set ghostty_terminal_id (osascript \
            -e 'tell application "Ghostty"' \
            -e 'set target_terminal to focused terminal of selected tab of front window' \
            -e 'perform action "activate_key_table:herdr" on target_terminal' \
            -e 'return id of target_terminal' \
            -e 'end tell')

        if test $status -ne 0
            return 1
        end
    end

    command herdr $argv
    set -l herdr_status $status

    if test -n "$ghostty_terminal_id"
        osascript \
            -e 'on run argv' \
            -e 'set target_id to item 1 of argv' \
            -e 'tell application "Ghostty"' \
            -e 'set matches to every terminal whose id is target_id' \
            -e 'if (count of matches) > 0 then' \
            -e 'perform action "deactivate_key_table" on item 1 of matches' \
            -e 'end if' \
            -e 'end tell' \
            -e 'end run' \
            "$ghostty_terminal_id" >/dev/null
    end

    return $herdr_status
end
