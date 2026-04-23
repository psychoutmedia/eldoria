from datetime import datetime

LOG_FILE = "mood_log.txt"

def log_entry():
    """Ask for mood, weather, and energy level, then save to file."""
    mood = input("How are you feeling today? ")
    weather = input("What's the weather like? ")
    energy = input("Energy level (1-10): ")

    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    entry = f"[{timestamp}] Mood: {mood} | Weather: {weather} | Energy: {energy}/10\n"

    with open(LOG_FILE, "a") as f:
        f.write(entry)

    print("Entry saved!")

def read_entries():
    """Display all past entries."""
    try:
        with open(LOG_FILE, "r") as f:
            entries = f.read()
            if entries:
                print("\n--- Past Entries ---")
                print(entries)
            else:
                print("No entries yet.")
    except FileNotFoundError:
        print("No entries yet. Start logging!")

def main():
    while True:
        print("\n=== Mood & Weather Logger ===")
        print("1. Log new entry")
        print("2. Read past entries")
        print("3. Exit")

        choice = input("\nChoose an option (1-3): ")

        if choice == "1":
            log_entry()
        elif choice == "2":
            read_entries()
        elif choice == "3":
            print("Goodbye!")
            break
        else:
            print("Invalid choice. Please enter 1, 2, or 3.")

if __name__ == "__main__":
    main()
