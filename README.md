# Clipov - Intelligent Video Compilation Platform

A modern video compilation platform with web and mobile applications, featuring AI-powered video analysis and smart content processing.

## 🎯 Project Overview

Clipov enables users to upload, analyze, and compile videos using intelligent AI processing. The platform consists of:

- **Web App**: Next.js 14 with React and TypeScript
- **Mobile App**: React Native (coming soon)
- **Shared Backend**: Firebase (Authentication, Firestore, Cloud Storage)

## 🏗️ Architecture

```
clipov/
├── web/          # Next.js web application
├── mobile/       # React Native mobile app (planned)
├── shared/       # Shared utilities and types (planned)
└── README.md
```

## 🚀 Features

### Phase 1 - Authentication System ✅
- [x] Firebase Authentication (Email/Password + Google OAuth)
- [x] User profile management
- [x] Protected routes
- [x] Responsive UI with Tailwind CSS

### Phase 2 - Video Upload (In Progress)
- [ ] Chunked video upload with progress tracking
- [ ] Cloud Storage integration
- [ ] Upload session management
- [ ] Error handling and retry logic

### Phase 3 - AI Analysis (Planned)
- [ ] Video content analysis
- [ ] Scene detection
- [ ] Audio processing
- [ ] Metadata extraction

### Phase 4 - Compilation (Planned)
- [ ] Automated video compilation
- [ ] Custom compilation rules
- [ ] Export options
- [ ] Preview functionality

## 🛠️ Tech Stack

### Frontend
- **Next.js 14** (App Router)
- **React 18** with TypeScript
- **Tailwind CSS** for styling
- **React Hook Form** for form management

### Backend & Services
- **Firebase Authentication** for user management
- **Cloud Firestore** for data storage
- **Cloud Storage** for video files
- **Firebase Hosting** for deployment

### Development Tools
- **ESLint** for code linting
- **TypeScript** for type safety
- **Git** for version control

## 📦 Installation & Setup

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Firebase account

### Web Application Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd clipov
   ```

2. **Install dependencies**
   ```bash
   cd web
   npm install
   ```

3. **Environment Setup** 
   - Copy `web/.env.example` to `web/.env.local`
   - Add your Firebase configuration values

4. **Start development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   Navigate to `http://localhost:3000`

## 🔥 Firebase Configuration

The project requires Firebase services:

- **Authentication**: Email/Password + Google OAuth
- **Firestore Database**: User profiles and video metadata
- **Cloud Storage**: Video file storage
- **Security Rules**: Configured for user data protection

## 🧪 Testing

```bash
cd web
npm run test        # Run tests
npm run test:watch  # Run tests in watch mode
npm run lint        # Run ESLint
```

## 📱 Mobile App (Coming Soon)

The React Native mobile application will provide:
- Native video recording and upload
- Offline capability
- Push notifications
- Optimized mobile UI

## 🚀 Deployment

### Web App
- **Development**: Firebase Hosting
- **Production**: Vercel (recommended) or Firebase Hosting

### Mobile App
- **iOS**: App Store
- **Android**: Google Play Store

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🎉 Acknowledgments

- Firebase for backend services
- Next.js team for the amazing framework
- Tailwind CSS for utility-first styling

---

**Status**: 🚧 Under Active Development

**Last Updated**: December 2024 