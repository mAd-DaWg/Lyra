#!/bin/bash
DIR="$( dirname -- "${BASH_SOURCE[0]}"; )";   # Get the directory name
DIR="$( realpath -e -- "$DIR"; )";    # Resolve its full path if need be
cd $DIR;
# Function to launch a command in a new gnome-terminal window
launch_terminal() {
    echo "Launching terminal with command: $1"
    gnome-terminal -- bash -c "$1"
}
t_session_name="lyraTmux"

echo "Starting script..."

# Check if tmux is installed
if ! command -v tmux &> /dev/null; then
    echo "tmux could not be found, launching terminal windows instead."

    # Launch three separate terminal windows
    echo "Launching nvtop in a new terminal..."
    launch_terminal 'nvtop' &

    echo "Launching startBG.sh in a new terminal..."
    launch_terminal './startBG.sh' &

    echo "Launching startLyra.sh in a new terminal (after waiting 1 minute)..."
    launch_terminal 'sleep 60; ./startLyra.sh' &
else
    echo "tmux is available, starting tmux session..."

    # Create a new tmux session named 'lyraTmux'
    if ! tmux has-session -t $t_session_name
    then
        echo "Creating new tmux session named '$t_session_name'"
        tmux new-session -d -s $t_session_name

        # Do the split and start commands
        echo "Starting 'nvtop'"
        tmux send-keys -t $t_session_name 'nvtop' C-m
        echo "Splitting tmux window into two vertical panes"
        tmux split-window -t $t_session_name -hf
        echo "Starting 'startBG.sh' in right pane"
        tmux send-keys -t $t_session_name './runBG.sh' C-m
        echo "Splitting right pane again for two horizontal panes"
        tmux split-window -t $t_session_name -v
        echo "Starting 'startLyra.sh' in bottom-right pane"
        tmux send-keys -t $t_session_name 'sleep 60; ./runLyra.sh' C-m
    fi
    # Attach to the tmux session
    echo "Attaching to the tmux session '$t_session_name'"
    tmux attach-session -t $t_session_name
fi

echo "Script finished."
exit 0