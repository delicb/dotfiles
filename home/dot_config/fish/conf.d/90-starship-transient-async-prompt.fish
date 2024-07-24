status is-interactive
or exit 0

if test -n "$XDG_RUNTIME_DIR"
    set -g __starship_async_tmpdir "$XDG_RUNTIME_DIR"/fish-async-prompt
else
    set -g __starship_async_tmpdir /tmp/fish-async-prompt
end
mkdir -p "$__starship_async_tmpdir"
set -g __starship_async_signal SIGUSR1

# Starship
set -g VIRTUAL_ENV_DISABLE_PROMPT 1
builtin functions -e fish_mode_prompt
set -gx STARSHIP_SHELL fish
set -gx STARSHIP_SESSION_KEY (random 10000000000000 9999999999999999)

# Transient prompt
# function __starship_async_cancel_repaint --on-event fish_cancel
#     commandline -f repaint
# end
# function __starship_async_maybe_execute
#     commandline --is-valid
#     if test $status != 2
#         set -g TRANSIENT 1
#         commandline -f repaint
#     end
#     commandline -f execute
# end
# function __starship_async_cancel_commandline
#     if string length -q -- (commandline)
#         set -g TRANSIENT 1
#         commandline -f repaint
#     end
#     commandline -f cancel-commandline
# end
# function __starship_async_edit_command_buffer
#     printf '\e[2F' # 2 lines up
#     edit_command_buffer
# end
# bind \r  __starship_async_maybe_execute       # ENTER
# bind \cc __starship_async_cancel_commandline  # CTRL+C
# bind \ee __starship_async_edit_command_buffer # ALT+E
# bind \ev __starship_async_edit_command_buffer # ALT+V

# Prompt
function fish_prompt
    printf '\e[0J' # Clear from cursor to end of screen
    if test $TRANSIENT -eq 1 &> /dev/null
        set -g TRANSIENT 0
        __starship_async_simple_prompt
    else if test -e "$__starship_async_tmpdir"/"$fish_pid"_fish_prompt
        cat "$__starship_async_tmpdir"/"$fish_pid"_fish_prompt
    else
        __starship_async_simple_prompt
    end
end

# Async task
function __starship_async_fire --on-event fish_prompt
    switch "$fish_key_bindings"
        case fish_hybrid_key_bindings fish_vi_key_bindings
            set STARSHIP_KEYMAP "$fish_bind_mode"
        case '*'
            set STARSHIP_KEYMAP insert
    end
    set STARSHIP_CMD_PIPESTATUS $pipestatus
    set STARSHIP_CMD_STATUS $status
    set STARSHIP_DURATION "$CMD_DURATION"
    set STARSHIP_JOBS (count (jobs -p))

    set -l tmpfile "$__starship_async_tmpdir"/"$fish_pid"_fish_prompt
    fish -c '
    starship prompt --terminal-width="'$COLUMNS'" --status='$STARSHIP_CMD_STATUS' --pipestatus="'$STARSHIP_CMD_PIPESTATUS'" --keymap='$STARSHIP_KEYMAP' --cmd-duration='$STARSHIP_DURATION' --jobs='$STARSHIP_JOBS' > '$tmpfile'
    kill -s "'$__starship_async_signal'" '$fish_pid &
    disown
end

function __starship_async_simple_prompt
    set_color brgreen
    echo -n '❯'
    set_color normal
    echo ' '
end

function __starship_async_repaint_prompt --on-signal "$__starship_async_signal"
    commandline -f repaint
end

function __starship_async_cleanup --on-event fish_exit
    rm -f "$__starship_async_tmpdir"/"$fish_pid"_fish_prompt
end

# https://github.com/acomagu/fish-async-prompt
# https://github.com/fish-shell/fish-shell/issues/8223
