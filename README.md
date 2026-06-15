# Voxplain

**Master your presentation skills with AI-powered feedback.**

Voxplain is a presentation practice tool designed for students and professionals who want to improve their public speaking abilities. Record your presentations, and get instant feedback on your delivery with transcript analysis, speech metrics, and actionable insights.

**[Try Voxplain Live](https://voxplain.vercel.app/)**

## What is Voxplain?

Voxplain helps you become a better presenter by providing detailed analysis of your speech:

- **Audio Recording**: Record presentations directly in your browser
- **Automated Transcription**: Get accurate transcripts of your speech powered by AssemblyAI
- **Speech Metrics**: Analyze your delivery with metrics like Words Per Minute (WPM)
- **Filler Word Detection**: Identify and track filler words (um, uh, like, etc.)
- **Actionable Feedback**: Receive specific tips to improve your speaking
- **Transcript Highlighting**: Review your speech with visual highlighting of problem areas

## Who Is This For?

- **Students**: Practice presentations before class or exams
- **Professionals**: Improve speaking skills for meetings and conferences
- **Public Speakers**: Refine your delivery and reduce filler words
- **Anyone**: Get immediate, honest feedback on how you communicate

## The Impact

By using Voxplain, you'll:
- Build confidence in your speaking ability
- Reduce filler words and improve clarity
- Optimize your pacing and speech rate
- Get concrete, measurable feedback on improvement over time
- Become a more effective communicator

## Tech Stack

- **Frontend**: React (Vite), TypeScript, TailwindCSS
- **Backend**: Node.js, Express, TypeScript
- **Transcription**: AssemblyAI API
- **Database & Storage**: Supabase
- **Processing**: FFmpeg, Music Metadata

## Quick Start

To get started with Voxplain on your local machine, follow the [QUICKSTART.md](./QUICKSTART.md) guide.

## Features

- ✅ **Browser-based Recording** - No downloads needed, record directly in your browser
- ✅ **Instant Transcription** - Get text of your speech automatically
- ✅ **Speech Analytics** - WPM, filler word count, speech rate analysis
- ✅ **Real-time Feedback** - Tips to improve your delivery
- ✅ **Transcript Review** - See exactly what you said with problem areas highlighted

## Project Structure

```
voxplain/
├── client/                 # React frontend (Vite)
├── server/                # Node.js + Express backend
├── ml/                    # Machine learning components (optional)
├── supabase/              # Database schema and configuration
├── QUICKSTART.md          # Setup and installation guide
└── README.md              # This file
```

## Development

For development setup instructions, API key configuration, and running the application locally, see [QUICKSTART.md](./QUICKSTART.md).

## Future Roadmap

- 📊 **Progress Tracking** - Save reports and track improvements over time
- 👤 **User Accounts** - Sign up to manage your presentation history
- 🎥 **Video Analysis** - Add body language and visual delivery analysis
- 🌍 **Multiple Languages** - Support for presentations in different languages
- 🤝 **Collaboration** - Share presentations and get peer feedback

## Contributing

This is an open-source project! We welcome contributions from developers of all skill levels. Whether you're fixing bugs, adding features, or improving documentation, your help is appreciated.

To contribute:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to your branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Support

If you have questions or encounter issues, please:
- Check the [QUICKSTART.md](./QUICKSTART.md) for setup help
- Review existing issues in the repository
- Create a new issue with a detailed description

## License

This project is open source and available under the ISC License.

---

**Ready to improve your presentation skills?** Start with the [QUICKSTART.md](./QUICKSTART.md) guide to set up Voxplain locally, or visit [https://voxplain.vercel.app/](https://voxplain.vercel.app/) to try it online.
