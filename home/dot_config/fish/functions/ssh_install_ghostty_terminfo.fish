function ssh_install_ghostty_terminfo --description "Install xterm-ghostty terminfo on a remote host over SSH"
    if test (count $argv) -eq 0
        echo "usage: ssh_install_ghostty_terminfo <user@host> [ssh args...]" >&2
        return 1
    end

    if not type -q infocmp
        echo "infocmp not found locally" >&2
        return 1
    end

    if not infocmp xterm-ghostty >/dev/null 2>&1
        echo "xterm-ghostty terminfo missing locally; install it first" >&2
        return 1
    end

    echo "Shipping xterm-ghostty terminfo to $argv[1]..."
    infocmp -x xterm-ghostty | ssh $argv -- tic -x -
    and echo "Done. New SSH sessions to $argv[1] should stop complaining."
end
